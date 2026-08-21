/**
 * Storage access for boards. The only place that knows how a board is stored.
 *
 * Three decisions worth knowing before reading on:
 *
 * 1. Everything you search or sort by is a real column. Only the values of
 *    the freely configurable board columns sit together in task.col_values
 *    as JSON.
 * 2. Every write runs in a transaction. When changing single fields the task
 *    row is locked first with SELECT ... FOR UPDATE, so two people touching
 *    the same task at the same time do not overwrite each other.
 * 3. Moving a task to another group is ONE transaction. Doing it as an insert
 *    followed by a delete leaves the task in two places if it breaks off in
 *    between, which is what used to happen.
 */
const crypto = require('crypto')
const {db, parseJson, toJson} = require('../../db/knex')

const MAX_ACTIVITIES = 40

function httpError(status, msg){
    const err = new Error(msg)
    err.status = status
    return err
}

const sid = v => (v === undefined || v === null)?'':String(v)

/** The three lives of a board, a group and a task. See the lifecycle migration. */
const ACTIVE = 'active'
const ARCHIVED = 'archived'
const TRASHED = 'trashed'
const STATES = [ACTIVE, ARCHIVED, TRASHED]
const newBoardId = () => crypto.randomBytes(12).toString('hex')
const newShortId = () => crypto.randomBytes(6).toString('hex')

/** Board ids are 24 hex characters — like the ObjectId used to be. */
function checkBoardId(boardId){
    const id = sid(boardId)
    if(!/^[a-f0-9]{24}$/i.test(id)) throw httpError(404, 'Board nicht gefunden')
    return id.toLowerCase()
}

const tx = fn => db().transaction(fn)

/* ================================================================ Lesen == */

const COLUMN_OWN = new Set(['id', 'type', 'title', 'field'])
// Fields of a task that have a column or a table of their own. Everything
// else lands in the col_values JSON — which is why `subtasks` has to be listed
// here: without it the children would be serialised into their parent's JSON
// as well as being rows, and the two copies would drift apart within a day.
const ROLE_NAMES = new Set(['owner', 'editor', 'viewer'])

// `createdAt`/`createdBy` are read back out of the task's own columns, so
// they must not be swept into col_values when a client echoes them back —
// that would leave two copies, and the stale one would win on the next write.
const TASK_OWN = new Set(['id', 'title', 'memberIds', 'comments', 'subtasks', 'createdAt', 'createdBy'])

function buildColumn(row){
    return {id: row.id, type: row.type, title: row.title, field: row.field, ...(parseJson(row.settings, {}) || {})}
}

/**
 * `subtasks` is only set on a task that has a parent of its own — that is what
 * says "one level" in the shape of the data rather than only in a rule
 * somewhere. A subtask has no `subtasks` key at all, so anything that walks
 * the tree stops on its own.
 */
function buildTask(row, memberIds, comments, subtasks){
    const values = parseJson(row.col_values, {}) || {}
    const task = {...values, id: row.id, title: row.title === null?'':row.title, memberIds, comments}
    // After the spread, so a stray col_values entry of the same name cannot
    // overwrite what the row itself says.
    task.createdAt = row.created_at === null || row.created_at === undefined?null:Number(row.created_at)
    // The id alone; the name and the picture are filled in when the board is
    // read — same as every other person in this file.
    task.createdBy = row.created_by_id?{_id: row.created_by_id}:null
    if(subtasks) task.subtasks = subtasks
    return task
}

function buildComment(row){
    return {
        id: row.id,
        parentId: row.parent_id || null,
        txt: row.txt === null?'':row.txt,
        archivedAt: row.created_at === null?null:Number(row.created_at),
        // null, never 0: "pinned at the epoch" and "never pinned" have to stay
        // tellable apart, and 0 is falsy in both places that read this.
        pinnedAt: row.pinned_at === null || row.pinned_at === undefined?null:Number(row.pinned_at),
        // The id and nothing else. The name and the picture are filled in
        // when the board is read, from the user table — see enrichPeople in
        // board.service.js. A copy stored here went stale the day somebody
        // changed their profile.
        byMember: {_id: row.by_user_id || null},
        attachments: parseJson(row.attachments, []) || [],
        style: parseJson(row.style, {}) || {}
    }
}

/**
 * from/to of an activity is sometimes a label object, sometimes a string,
 * sometimes a number. So nobody has to guess when reading, they go into an
 * envelope: {"v": <value>}. A bare value from the time before is still
 * understood.
 */
function wrapValue(value){
    if(value === undefined || value === null) return null
    return toJson({v: value})
}

function unwrapValue(raw){
    const parsed = parseJson(raw, null)
    if(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'v' in parsed) return parsed.v
    // Legacy: the value sat in the column without an envelope.
    if(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !Object.keys(parsed).length) return null
    return parsed
}

function buildActivity(row){
    return {
        action: row.action,
        createdAt: row.created_at === null?null:Number(row.created_at),
        byMember: {_id: row.by_user_id || null},
        task: {id: row.task_id || '', title: row.task_title === null?'':row.task_title},
        from: unwrapValue(row.from_value),
        to: unwrapValue(row.to_value)
    }
}

function bucket(rows, keyFn){
    const map = new Map()
    for(const row of rows){
        const key = keyFn(row)
        if(!map.has(key)) map.set(key, [])
        map.get(key).push(row)
    }
    return map
}

/**
 * Assemble the board rows into the objects the rest of the application knows.
 * Deliberately queried one after another: if the whole thing runs in a
 * transaction, everything hangs on one connection and must not go in parallel.
 */
async function assemble(k, boardRows){
    if(!boardRows.length) return []
    const ids = boardRows.map(b => b.id)

    // Active members only, and this is a permission filter rather than a
    // display one: board.members is what board.roles.js reads to decide who
    // may do what. Somebody taken off a board keeps their row — see the
    // people-state migration — and must not turn up here.
    const members = await k('board_member').whereIn('board_id', ids).where('state', ACTIVE)
        .orderBy('board_id').orderBy('position')
    const columns = await k('board_column').whereIn('board_id', ids).orderBy('board_id').orderBy('position')
    // Only what is on the board. Archived and thrown-away rows stay in the
    // table and are read by findBin, never by the board itself — see the
    // lifecycle migration for why there is no cascade to make this simpler.
    const groups = await k('board_group').whereIn('board_id', ids).where('state', ACTIVE)
        .orderBy('board_id').orderBy('position')
    const tasks = await k('task').whereIn('board_id', ids).where('state', ACTIVE)
        .orderBy('board_id').orderBy('position')
    const taskMembers = await k('task_member').whereIn('board_id', ids).orderBy('position')
    const comments = await k('task_comment').whereIn('board_id', ids).orderBy('position')
    const activities = await k('activity').whereIn('board_id', ids).orderBy('seq', 'desc')

    const membersByBoard = bucket(members, r => r.board_id)
    const columnsByBoard = bucket(columns, r => r.board_id)
    const groupsByBoard = bucket(groups, r => r.board_id)
    const tasksByBoard = bucket(tasks, r => r.board_id)
    const activitiesByBoard = bucket(activities, r => r.board_id)
    const membersByTask = bucket(taskMembers, r => r.board_id + ' ' + r.task_id)
    const commentsByTask = bucket(comments, r => r.board_id + ' ' + r.task_id)

    return boardRows.map(row => {
        const mem = membersByBoard.get(row.id) || []
        const rowsOfBoard = tasksByBoard.get(row.id) || []
        // Top level and children are separated once, here. Everything below
        // reads from these two and never has to ask about parent_id again.
        const tasksOfBoard = bucket(rowsOfBoard.filter(r => !r.parent_id), r => r.group_id)
        const childrenOfTask = bucket(rowsOfBoard.filter(r => r.parent_id), r => r.parent_id)

        const toTask = (t, withChildren) => buildTask(
            t,
            (membersByTask.get(t.board_id + ' ' + t.id) || []).map(m => m.user_id),
            (commentsByTask.get(t.board_id + ' ' + t.id) || []).map(buildComment),
            withChildren?(childrenOfTask.get(t.id) || []).map(c => toTask(c, false)):undefined
        )

        return {
            _id: row.id,
            title: row.title === null?'':row.title,
            description: row.description === null?'':row.description,
            folder: row.folder || '',
            isStarred: !!row.is_starred,
            // Creation time. The name is older than the archive and means the
            // opposite of what it sounds like — see the lifecycle migration.
            archivedAt: row.archived_at === null?null:Number(row.archived_at),
            state: row.state || ACTIVE,
            stateAt: row.state_at === null || row.state_at === undefined?null:Number(row.state_at),
            stateBy: row.state_by || null,
            createdBy: {_id: row.created_by_id || ''},
            labels: parseJson(row.labels, []) || [],
            members: mem.map(m => ({
                _id: m.user_id,
                // The role travels with the member rather than in a list of
                // its own — a second list would have to be kept in step, and
                // the one place that forgets is a permission hole.
                role: m.role || (m.is_owner?'owner':'editor')
            })),
            ownerIds: mem.filter(m => m.is_owner || m.role === 'owner').map(m => m.user_id),
            columns: (columnsByBoard.get(row.id) || []).map(buildColumn),
            groups: (groupsByBoard.get(row.id) || []).map(g => ({
                id: g.id,
                title: g.title === null?'':g.title,
                color: g.color || '',
                icon: g.icon || '',
                createdBy: g.created_by || null,
                archivedAt: g.archived_at === null?null:Number(g.archived_at),
                tasks: (tasksOfBoard.get(g.id) || []).map(t => toTask(t, true))
            })),
            activities: (activitiesByBoard.get(row.id) || []).map(buildActivity)
        }
    })
}

async function findById(boardId){
    let id
    try {
        id = checkBoardId(boardId)
    } catch(err) {
        return null
    }
    const k = db()
    const row = await k('board').where({id}).first()
    if(!row) return null
    const [board] = await assemble(k, [row])
    return board
}

/** The boards this user is allowed to see. */
async function findForUser(user, filterBy = {}){
    if(!user) return []
    const k = db()
    // The board list is the boards, not the bin. Archived and thrown-away
    // ones are asked for by name, through findBoardsByState.
    let q = k('board').select('board.*').where('board.state', ACTIVE)
    if(!user.isAdmin){
        q = q.whereIn('board.id', k('board_member').select('board_id')
            .where({user_id: sid(user._id), state: ACTIVE}))
    }
    if(filterBy.title){
        const needle = String(filterBy.title).toLowerCase().replace(/[%_\\]/g, ch => '\\' + ch)
        q = q.whereRaw('LOWER(board.title) LIKE ?', ['%' + needle + '%'])
    }
    if(filterBy.isStarred) q = q.where('board.is_starred', true)
    const rows = await q.orderBy('board.created_at')
    return await assemble(k, rows)
}

/* =============================================================== Helfer == */

async function requireBoardRow(trx, boardId){
    const id = checkBoardId(boardId)
    const row = await trx('board').where({id}).first()
    if(!row) throw httpError(404, 'Board nicht gefunden')
    return id
}

async function requireGroupRow(trx, boardId, groupId){
    const row = await trx('board_group').where({board_id: boardId, id: groupId}).first()
    if(!row) throw httpError(404, 'Gruppe nicht gefunden')
    return row
}

/**
 * `where` is an object or a function that narrows a query.
 *
 * The function form exists for one reason: positions of top-level tasks are
 * counted among top-level tasks only, and `{parent_id: null}` in knex becomes
 * `parent_id = NULL`, which matches nothing. That has to be `whereNull`, and a
 * plain object cannot say it.
 */
function narrow(q, where){
    return typeof where === 'function'?where(q):q.where(where)
}

async function nextPosition(trx, table, where){
    const row = await narrow(trx(table), where).max({m: 'position'}).first()
    return (row && row.m !== null && row.m !== undefined)?Number(row.m) + 1:0
}

async function shiftPositions(trx, table, where, fromPosition){
    await narrow(trx(table), where).where('position', '>=', fromPosition).increment('position', 1)
}

/** Top-level tasks of one group — the scope a task position is counted in. */
const topLevelOf = (boardId, groupId) =>
    q => q.where({board_id: boardId, group_id: groupId}).whereNull('parent_id')

/** The children of one task — the scope a subtask position is counted in. */
const childrenOf = (boardId, parentId) =>
    q => q.where({board_id: boardId, parent_id: parentId})

function splitTask(task){
    const values = {}
    for(const [key, value] of Object.entries(task || {})){
        if(TASK_OWN.has(key)) continue
        values[key] = value
    }
    const updatedBy = (task && task.updatedBy) || {}
    return {
        title: (task && task.title !== undefined && task.title !== null)?String(task.title):'',
        values,
        memberIds: Array.isArray(task && task.memberIds)?task.memberIds.map(sid).filter(Boolean):[],
        comments: Array.isArray(task && task.comments)?task.comments:[],
        // Mirror for DBeaver and later analysis. The truth still lives
        // in col_values.updatedBy, so nothing gets lost.
        updatedAt: Number.isFinite(Number(updatedBy.date))?Number(updatedBy.date):null,
        updatedById: updatedBy._id?sid(updatedBy._id):null
    }
}

async function syncTaskMembers(trx, boardId, taskId, memberIds){
    await trx('task_member').where({board_id: boardId, task_id: taskId}).del()
    if(!memberIds.length) return
    const seen = new Set()
    const rows = []
    memberIds.forEach((userId, i) => {
        if(seen.has(userId)) return
        seen.add(userId)
        rows.push({board_id: boardId, task_id: taskId, user_id: userId, position: i})
    })
    await trx('task_member').insert(rows)
}

/**
 * One comment, appended, without rewriting the task's whole comment list.
 *
 * `syncTaskComments` deletes every row and writes them again; that is right
 * for a browser holding the full task, and wrong for a caller that only wants
 * to add a line. Two scripts posting at the same moment through the sync path
 * would each write their own idea of the list, and one of the two comments
 * would simply not be there.
 *
 * Newest first is `position` ascending, so a new one goes in front of the
 * lowest. Negative positions are fine — nothing reads the number, only the
 * order — and the next full task write normalises them back to 0..n.
 */
async function addComment(boardId, taskId, comment){
    return await tx(async trx => {
        const id = await requireBoardRow(trx, boardId)
        const task = await trx('task').where({board_id: id, id: sid(taskId)}).first()
        if(!task) throw httpError(404, 'Task nicht gefunden')

        const lowest = await trx('task_comment')
            .where({board_id: id, task_id: sid(taskId)})
            .min({p: 'position'}).first()
        const position = Number.isFinite(Number(lowest && lowest.p))?Number(lowest.p) - 1:0

        const row = {
            board_id: id,
            task_id: sid(taskId),
            id: newShortId(),
            position,
            parent_id: (comment && comment.parentId)?sid(comment.parentId):null,
            created_at: Number.isFinite(Number(comment && comment.archivedAt))
                ?Number(comment.archivedAt)
                :Date.now(),
            pinned_at: null,
            by_user_id: (comment && comment.byUserId)?sid(comment.byUserId):null,
            txt: (comment && comment.txt) || '',
            style: toJson({}),
            attachments: toJson([])
        }
        await trx('task_comment').insert(row)
        return {id: row.id, groupId: task.group_id}
    })
}

async function syncTaskComments(trx, boardId, taskId, comments){
    await trx('task_comment').where({board_id: boardId, task_id: taskId}).del()

    /**
     * Reactions belong to comment ids, not to comment rows.
     *
     * The rows above are deleted and written again on every task write, with
     * the same ids — so reactions must not hang off them by a foreign key or
     * they would vanish on an unrelated edit. They are kept in step here
     * instead: whatever no longer has a comment to point at goes.
     */
    const keptIds = comments.map(c => sid(c && c.id)).filter(Boolean)
    // Both tables hang off comment ids without a foreign key, and for the same
    // reason. Adding a third one means adding it here — that is the price of
    // the rewrite above, and it is cheaper than the cascade would be.
    for(const table of ['comment_reaction', 'comment_seen']){
        const orphans = trx(table).where({board_id: boardId, task_id: taskId})
        if(keptIds.length) orphans.whereNotIn('comment_id', keptIds)
        await orphans.del()
    }

    if(!comments.length) return
    const seen = new Set()
    const rows = []
    comments.forEach((c, i) => {
        let id = sid(c && c.id) || newShortId()
        while(seen.has(id)) id = newShortId()
        seen.add(id)
        const by = (c && c.byMember) || {}
        rows.push({
            board_id: boardId, task_id: taskId, id, position: i,
            parent_id: (c && c.parentId)?sid(c.parentId):null,
            created_at: Number.isFinite(Number(c && c.archivedAt))?Number(c.archivedAt):null,
            pinned_at: Number.isFinite(Number(c && c.pinnedAt)) && Number(c.pinnedAt) > 0?Number(c.pinnedAt):null,
            by_user_id: by._id?sid(by._id):null,
            txt: (c && c.txt) || '',
            style: toJson((c && c.style) || {}),
            attachments: toJson((c && c.attachments) || [])
        })
    })
    await trx('task_comment').insert(rows)
}

/**
 * Write a whole task (create or replace).
 *
 * With `parentId` set this writes a subtask. A subtask keeps the group of its
 * parent in `group_id` — see the migration for why that redundancy is wanted.
 *
 * `task.subtasks` is written along with it, but only one level down: a
 * subtask's own `subtasks` is ignored rather than followed, so a client that
 * sends a deeper tree gets it flattened instead of silently stored.
 */
async function writeTask(trx, boardId, groupId, task, position, parentId = null, createdBy = null){
    const s = splitTask(task)
    const id = sid(task && task.id) || newShortId()
    await trx('task').insert({
        board_id: boardId, id, group_id: groupId, position, parent_id: parentId || null,
        title: s.title, col_values: toJson(s.values),
        updated_at: s.updatedAt, updated_by_id: s.updatedById
    }).onConflict(['board_id', 'id']).merge()

    /**
     * Stamped once, and only when it is still empty.
     *
     * This function is also the one that rewrites a whole task, so setting
     * the creation data with the insert above would move it every time
     * somebody saved. A separate write guarded by `whereNull` says what is
     * meant: this is the moment the row began, and a moment does not change.
     */
    await trx('task').where({board_id: boardId, id}).whereNull('created_at')
        .update({created_at: Date.now(), created_by_id: createdBy?sid(createdBy._id || createdBy):null})
    await syncTaskMembers(trx, boardId, id, s.memberIds)
    await syncTaskComments(trx, boardId, id, s.comments)
    if(!parentId) await syncSubtasks(trx, boardId, groupId, id, task && task.subtasks)
    return id
}

/**
 * Bring the children of one task to the given list.
 *
 * `undefined` means "the caller did not say", and then the children are left
 * exactly as they are. Only an actual array is taken as the new truth — a
 * patch that happens not to mention subtasks must not delete them.
 */
async function syncSubtasks(trx, boardId, groupId, parentId, subtasks){
    if(!Array.isArray(subtasks)) return
    const wanted = subtasks.map(t => sid(t && t.id)).filter(Boolean)
    // Same reason as in syncGroupTasks: a subtask in the bin is not in the
    // list and must not be read as one that was removed.
    const existing = await trx('task')
        .where({board_id: boardId, parent_id: parentId, state: ACTIVE}).select('id')
    const gone = existing.map(r => r.id).filter(id => !wanted.includes(id))
    if(gone.length) await trx('task').where({board_id: boardId, parent_id: parentId}).whereIn('id', gone).del()
    for(let i = 0; i < subtasks.length; i++){
        await writeTask(trx, boardId, groupId, subtasks[i], i, parentId)
    }
}

/** Bring the tasks of a group to the given list. */
async function syncGroupTasks(trx, boardId, groupId, tasks){
    const wanted = tasks.map(t => sid(t.id)).filter(Boolean)
    // Top level only. Without whereNull this reads every subtask of the group
    // as a task that is no longer in the list and deletes the lot.
    // `state: ACTIVE` is not a nicety. A thrown-away task is not in the list
    // the client sends, so without this it counts as "no longer there" and is
    // deleted for real — the bin would empty itself, at unpredictable moments,
    // with no error anywhere.
    const existing = await trx('task')
        .where({board_id: boardId, group_id: groupId, state: ACTIVE}).whereNull('parent_id').select('id')
    const gone = existing.map(r => r.id).filter(id => !wanted.includes(id))
    if(gone.length) await trx('task').where({board_id: boardId, group_id: groupId}).whereIn('id', gone).del()
    for(let i = 0; i < tasks.length; i++) await writeTask(trx, boardId, groupId, tasks[i], i)
}

async function writeGroup(trx, boardId, group, position){
    const id = sid(group && group.id) || newShortId()
    await trx('board_group').insert({
        board_id: boardId, id, position,
        title: (group && group.title) || '',
        color: (group && group.color) || '',
        icon: sanitizeIcon(group && group.icon),
        created_by: (group && group.createdBy)?sid(group.createdBy):null,
        archived_at: Number.isFinite(Number(group && group.archivedAt))?Number(group.archivedAt):null
    }).onConflict(['board_id', 'id']).merge()
    return id
}

async function writeColumns(trx, boardId, columns){
    await trx('board_column').where({board_id: boardId}).del()
    if(!Array.isArray(columns) || !columns.length) return
    const rows = columns.map((c, i) => {
        const settings = {}
        for(const [key, value] of Object.entries(c || {})){
            if(!COLUMN_OWN.has(key)) settings[key] = value
        }
        return {
            board_id: boardId, id: sid(c.id) || newShortId(), position: i,
            type: c.type || 'text', title: c.title || '', field: c.field || sid(c.id),
            settings: Object.keys(settings).length?toJson(settings):null
        }
    })
    await trx('board_column').insert(rows)
}

/**
 * Bring the member list of a board to what was asked for.
 *
 * Nobody is deleted. Whoever is no longer in the list is switched off, and
 * whoever comes back gets their old row switched on again — with everything
 * that hung off it. Deleting and re-inserting would work exactly as well until
 * somebody is re-invited, and then they would be a stranger on a board full of
 * their own updates.
 */
async function writeMembers(trx, boardId, members, ownerIds){
    const owners = new Set((ownerIds || []).map(sid))
    const list = (members || []).filter(m => m && m._id)
    const seen = new Set()
    const rows = []
    list.forEach((m, i) => {
        const userId = sid(m._id)
        if(seen.has(userId)) return
        seen.add(userId)
        // The role is the truth; is_owner is written alongside it because the
        // socket layer and a few queries still read the boolean. One of them
        // being stale is a permission hole, so they are set together, here,
        // and nowhere else.
        const role = ROLE_NAMES.has(m.role)?m.role:(owners.has(userId)?'owner':'editor')
        rows.push({
            board_id: boardId, user_id: userId, position: i,
            role, is_owner: role === 'owner',
            // In the inserted columns on purpose: `merge` below reads this
            // list, so coming back switches the old row on again.
            state: ACTIVE, state_at: null
        })
    })

    const keep = rows.map(r => r.user_id)
    const dropped = trx('board_member').where({board_id: boardId, state: ACTIVE})
    if(keep.length) dropped.whereNotIn('user_id', keep)
    await dropped.update({state: 'inactive', state_at: Date.now()})

    if(rows.length){
        await trx('board_member').insert(rows).onConflict(['board_id', 'user_id']).merge()
    }
}

function boardMetaRow(board){
    const createdBy = board.createdBy || {}
    return {
        title: board.title || '',
        description: board.description || '',
        folder: board.folder || '',
        is_starred: !!board.isStarred,
        created_by_id: createdBy._id?sid(createdBy._id):null,
        archived_at: Number.isFinite(Number(board.archivedAt))?Number(board.archivedAt):null,
        labels: toJson(board.labels || [])
    }
}

/* ================================================================ Board == */

async function insert(board){
    const given = sid(board._id)
    const id = /^[a-f0-9]{24}$/i.test(given)?given.toLowerCase():newBoardId()
    await tx(async trx => {
        await trx('board').insert({id, ...boardMetaRow(board)})
        await writeMembers(trx, id, board.members, board.ownerIds)
        await writeColumns(trx, id, board.columns)
        const groups = Array.isArray(board.groups)?board.groups:[]
        for(let i = 0; i < groups.length; i++){
            const groupId = await writeGroup(trx, id, groups[i], i)
            await syncGroupTasks(trx, id, groupId, Array.isArray(groups[i].tasks)?groups[i].tasks:[])
        }
        const activities = Array.isArray(board.activities)?board.activities:[]
        for(const activity of activities.slice(0, MAX_ACTIVITIES).reverse()){
            await insertActivity(trx, id, activity)
        }
    })
    return {...board, _id: id}
}

async function deleteById(boardId){
    const id = checkBoardId(boardId)
    const count = await db()('board').where({id}).del()
    if(!count) throw httpError(404, 'Board nicht gefunden')
    return id
}

const BOARD_META_FIELDS = {
    title: 'title', description: 'description', folder: 'folder',
    isStarred: 'is_starred', archivedAt: 'archived_at'
}

async function updateMeta(boardId, patch){
    const update = {}
    for(const [key, column] of Object.entries(BOARD_META_FIELDS)){
        if(patch[key] === undefined) continue
        if(key === 'isStarred') update[column] = !!patch[key]
        else if(key === 'archivedAt') update[column] = Number.isFinite(Number(patch[key]))?Number(patch[key]):null
        else update[column] = patch[key] === null?'':String(patch[key])
    }
    if(!Object.keys(update).length) return
    const id = checkBoardId(boardId)
    const count = await db()('board').where({id}).update(update)
    if(!count) throw httpError(404, 'Board nicht gefunden')
}

async function setColumns(boardId, columns){
    await tx(async trx => {
        const id = await requireBoardRow(trx, boardId)
        await writeColumns(trx, id, columns)
    })
}

/**
 * The member list, with roles.
 *
 * A member arriving without a role keeps the one they had — an invite dialog
 * that only sends names must not silently demote everybody to editor. Somebody
 * genuinely new and unnamed becomes an editor.
 */
async function setMembers(boardId, members){
    await tx(async trx => {
        const id = await requireBoardRow(trx, boardId)
        const current = await trx('board_member').where({board_id: id, state: ACTIVE})
            .select('user_id', 'is_owner', 'role')
        const before = new Map(current.map(r => [r.user_id, r.role || (r.is_owner?'owner':'editor')]))

        const withRoles = (members || []).filter(m => m && m._id).map(m => ({
            ...m,
            role: ROLE_NAMES.has(m.role)?m.role:(before.get(sid(m._id)) || 'editor')
        }))
        await writeMembers(trx, id, withRoles, [])
    })
}

/** One person's role. The only way to change a role on its own. */
async function setMemberRole(boardId, userId, role){
    if(!ROLE_NAMES.has(role)) throw httpError(400, 'Unbekannte Rolle')
    const id = checkBoardId(boardId)
    const count = await db()('board_member')
        .where({board_id: id, user_id: sid(userId), state: ACTIVE})
        .update({role, is_owner: role === 'owner'})
    if(!count) throw httpError(404, 'Mitglied nicht gefunden')
}

/**
 * Who the owners are. Everyone else keeps the role they had, except that
 * somebody who WAS an owner and is no longer one becomes an editor — there is
 * no earlier role to fall back to, and dropping them to viewer would lock them
 * out of work they were doing a second ago.
 */
async function setOwners(boardId, ownerIds){
    await tx(async trx => {
        const id = await requireBoardRow(trx, boardId)
        const wanted = (ownerIds || []).map(sid)

        await trx('board_member').where({board_id: id, state: ACTIVE}).where('role', 'owner')
            .update({role: 'editor', is_owner: false})
        if(wanted.length){
            await trx('board_member').where({board_id: id, state: ACTIVE}).whereIn('user_id', wanted)
                .update({role: 'owner', is_owner: true})
        }
    })
}

/* ============================================================== Gruppen == */

async function addGroup(boardId, group, index = null){
    await tx(async trx => {
        const id = await requireBoardRow(trx, boardId)
        let position
        if(index === null || index === undefined){
            position = await nextPosition(trx, 'board_group', {board_id: id})
        } else {
            position = Number(index)
            await shiftPositions(trx, 'board_group', {board_id: id}, position)
        }
        const groupId = await writeGroup(trx, id, group, position)
        await syncGroupTasks(trx, id, groupId, Array.isArray(group.tasks)?group.tasks:[])
    })
}

async function removeGroup(boardId, groupId){
    const id = checkBoardId(boardId)
    await db()('board_group').where({board_id: id, id: groupId}).del()
}

const GROUP_META_FIELDS = {title: 'title', color: 'color', icon: 'icon', archivedAt: 'archived_at'}

/**
 * An emoji is text, and text from a browser is not to be trusted into a column
 * that everything reads. Cut to what the column holds, and cut by CODE POINTS
 * rather than by JavaScript string length: `String.prototype.length` counts
 * UTF-16 units, so slicing there can cut a surrogate pair in half and store
 * half a character.
 *
 * No check that it IS an emoji. There is no honest way to draw that line —
 * every list of "emoji ranges" is out of date the year it is written — and the
 * worst a stray letter can do here is look odd in front of a group name.
 */
function sanitizeIcon(value){
    const text = String(value == null?'':value).replace(/[\r\n\t]/g, '').trim()
    // Eight code points is at most sixteen UTF-16 units, which is exactly what
    // the column holds — so no second cut is needed, and a second cut by
    // string length is what would break a pair.
    return [...text].slice(0, 8).join('')
}

async function updateGroupMeta(boardId, groupId, patch){
    const update = {}
    for(const [key, column] of Object.entries(GROUP_META_FIELDS)){
        if(patch[key] === undefined) continue
        if(key === 'archivedAt') update[column] = Number.isFinite(Number(patch[key]))?Number(patch[key]):null
        else if(key === 'icon') update[column] = sanitizeIcon(patch[key])
        else update[column] = patch[key] === null?'':String(patch[key])
    }
    if(!Object.keys(update).length) return
    const id = checkBoardId(boardId)
    const count = await db()('board_group').where({board_id: id, id: groupId}).update(update)
    if(!count) throw httpError(404, 'Gruppe nicht gefunden')
}

async function replaceGroup(boardId, groupId, group){
    await tx(async trx => {
        const id = await requireBoardRow(trx, boardId)
        const row = await requireGroupRow(trx, id, groupId)
        await writeGroup(trx, id, {...group, id: groupId}, row.position)
        await syncGroupTasks(trx, id, groupId, Array.isArray(group.tasks)?group.tasks:[])
    })
}

/** Gets the groups in the wanted order; only positions change. */
async function reorderGroups(boardId, groups){
    await tx(async trx => {
        const id = await requireBoardRow(trx, boardId)
        for(let i = 0; i < groups.length; i++){
            await trx('board_group').where({board_id: id, id: sid(groups[i].id)}).update({position: i})
        }
    })
}

/* ================================================================ Tasks == */

async function addTask(boardId, groupId, task, index = null, createdBy = null){
    await tx(async trx => {
        const id = await requireBoardRow(trx, boardId)
        await requireGroupRow(trx, id, groupId)
        let position
        if(index === null || index === undefined){
            position = await nextPosition(trx, 'task', topLevelOf(id, groupId))
        } else {
            position = Number(index)
            await shiftPositions(trx, 'task', topLevelOf(id, groupId), position)
        }
        await writeTask(trx, id, groupId, task, position, null, createdBy)
    })
}

/** Deleting a task takes its subtasks with it — the foreign key does that. */
async function removeTask(boardId, groupId, taskId){
    const id = checkBoardId(boardId)
    await db()('task').where({board_id: id, group_id: groupId, id: taskId}).del()
}

/* ------------------------------------------------------------ Subtasks -- */

async function addSubtask(boardId, parentId, subtask, index = null, createdBy = null){
    await tx(async trx => {
        const id = await requireBoardRow(trx, boardId)
        const parent = await trx('task').where({board_id: id, id: parentId}).first()
        if(!parent) throw httpError(404, 'Task nicht gefunden')
        if(parent.parent_id) throw httpError(400, 'Ein Subtask kann keine Subtasks haben')

        let position
        if(index === null || index === undefined){
            position = await nextPosition(trx, 'task', childrenOf(id, parentId))
        } else {
            position = Number(index)
            await shiftPositions(trx, 'task', childrenOf(id, parentId), position)
        }
        await writeTask(trx, id, parent.group_id, subtask, position, parentId, createdBy)
    })
}

/**
 * Hang a task under another one, or take it back out.
 *
 * `parentId === null` promotes: the task becomes a top-level task of the group
 * it is currently in. Otherwise it becomes a child of that task and takes its
 * group with it — a subtask always sits in its parent's group, see the
 * migration.
 *
 * Positions are the fiddly part and the reason this is one transaction. The
 * task leaves one ordered list and joins another, and both lists have to stay
 * gapless: the row is taken out first, then the rest of its old list closes up,
 * then the new list opens a slot.
 */
async function setTaskParent(boardId, taskId, parentId, index = null){
    await tx(async trx => {
        const id = await requireBoardRow(trx, boardId)
        const row = await trx('task').where({board_id: id, id: taskId}).forUpdate().first()
        if(!row) throw httpError(404, 'Task nicht gefunden')

        let groupId = row.group_id
        if(parentId){
            const parent = await trx('task').where({board_id: id, id: parentId}).forUpdate().first()
            if(!parent) throw httpError(404, 'Zieltask nicht gefunden')
            if(parent.parent_id) throw httpError(400, 'Ein Subtask kann keine Subtasks haben')
            if(parent.id === row.id) throw httpError(400, 'Ein Task kann nicht sich selbst untergeordnet werden')
            const ownChildren = await trx('task').where({board_id: id, parent_id: taskId}).count({n: '*'}).first()
            if(Number(ownChildren && ownChildren.n)) throw httpError(400, 'Dieser Task hat selbst Subtasks')
            groupId = parent.group_id
        }

        // Out of the old list, and close the gap it leaves behind.
        const oldScope = row.parent_id?childrenOf(id, row.parent_id):topLevelOf(id, row.group_id)
        await narrow(trx('task'), oldScope)
            .where('position', '>', row.position).decrement('position', 1)

        const newScope = parentId?childrenOf(id, parentId):topLevelOf(id, groupId)
        let position
        if(index === null || index === undefined){
            position = await nextPosition(trx, 'task', newScope)
        } else {
            position = Number(index)
            await shiftPositions(trx, 'task', newScope, position)
        }

        await trx('task').where({board_id: id, id: taskId})
            .update({parent_id: parentId || null, group_id: groupId, position})
    })
}

/** The new order of one task's children. */
async function setSubtasks(boardId, parentId, subtasks){
    await tx(async trx => {
        const id = await requireBoardRow(trx, boardId)
        const parent = await trx('task').where({board_id: id, id: parentId}).first()
        if(!parent) throw httpError(404, 'Task nicht gefunden')
        await syncSubtasks(trx, id, parent.group_id, parentId, Array.isArray(subtasks)?subtasks:[])
    })
}

/**
 * Set single fields of a task — the most common write.
 *
 * The row is read locked, merged in JavaScript and written back. Sounds like a
 * detour, but it is exactly what stops two concurrent changes to different
 * columns of the same task from overwriting each other: the second
 * transaction waits.
 */
async function updateTaskFields(boardId, groupId, taskId, patch){
    const entries = Object.entries(patch || {}).filter(([key]) => key !== 'id')
    if(!entries.length) return
    await tx(async trx => {
        const id = await requireBoardRow(trx, boardId)
        const row = await trx('task').where({board_id: id, id: taskId}).forUpdate().first()
        if(!row) throw httpError(404, 'Task nicht gefunden')

        const values = parseJson(row.col_values, {}) || {}
        const update = {}
        let touchesValues = false

        for(const [key, value] of entries){
            if(key === 'title'){
                update.title = (value === null || value === undefined)?'':String(value)
                continue
            }
            if(key === 'memberIds'){
                await syncTaskMembers(trx, id, taskId, Array.isArray(value)?value.map(sid).filter(Boolean):[])
                continue
            }
            if(key === 'comments'){
                await syncTaskComments(trx, id, taskId, Array.isArray(value)?value:[])
                continue
            }
            if(key === 'subtasks'){
                // Rows, not JSON. Without this branch the children would fall
                // through into col_values below and exist twice.
                await syncSubtasks(trx, id, row.group_id, taskId, value)
                continue
            }
            values[key] = value
            touchesValues = true
            if(key === 'updatedBy'){
                const by = value || {}
                update.updated_at = Number.isFinite(Number(by.date))?Number(by.date):null
                update.updated_by_id = by._id?sid(by._id):null
            }
        }
        if(touchesValues) update.col_values = toJson(values)
        if(Object.keys(update).length) await trx('task').where({board_id: id, id: taskId}).update(update)
    })
}

async function replaceTask(boardId, groupId, taskId, task){
    await tx(async trx => {
        const id = await requireBoardRow(trx, boardId)
        const row = await trx('task').where({board_id: id, id: taskId}).forUpdate().first()
        if(!row) throw httpError(404, 'Task nicht gefunden')
        // The parent comes from the row, never from the payload: replacing a
        // task must not be a way to re-parent it behind the service's back.
        await writeTask(trx, id, row.group_id, {...task, id: taskId}, row.position, row.parent_id || null)
    })
}

async function setGroupTasks(boardId, groupId, tasks){
    await tx(async trx => {
        const id = await requireBoardRow(trx, boardId)
        await requireGroupRow(trx, id, groupId)
        await syncGroupTasks(trx, id, groupId, Array.isArray(tasks)?tasks:[])
    })
}

/**
 * Move a task to another group — one transaction, no in-between state. The
 * task itself is not rewritten, only where it belongs; comments and
 * assignments stay put.
 */
async function moveTask(boardId, fromGroupId, toGroupId, task, index = null){
    await tx(async trx => {
        const id = await requireBoardRow(trx, boardId)
        await requireGroupRow(trx, id, toGroupId)
        const taskId = sid(task && task.id?task.id:task)
        const row = await trx('task').where({board_id: id, id: taskId}).forUpdate().first()
        if(!row) throw httpError(404, 'Task nicht gefunden')

        if(row.parent_id) throw httpError(400, 'Ein Subtask wird mit seinem Task verschoben')

        let position
        if(index === null || index === undefined){
            position = await nextPosition(trx, 'task', topLevelOf(id, toGroupId))
        } else {
            position = Number(index)
            await shiftPositions(trx, 'task', topLevelOf(id, toGroupId), position)
        }
        await trx('task').where({board_id: id, id: taskId}).update({group_id: toGroupId, position})
        // The children carry the group of their parent. Leaving them behind
        // would point their foreign key at a group they are no longer under,
        // and deleting that group would take them with it.
        await trx('task').where({board_id: id, parent_id: taskId}).update({group_id: toGroupId})
    })
}

/* =========================================================== Aktivitaet == */

async function insertActivity(trx, boardId, activity){
    const a = activity || {}
    await trx('activity').insert({
        board_id: boardId,
        action: a.action || '',
        created_at: Number.isFinite(Number(a.createdAt))?Number(a.createdAt):Date.now(),
        by_user_id: a.byMember && a.byMember._id?sid(a.byMember._id):null,
        task_id: a.task && a.task.id?sid(a.task.id):null,
        task_title: a.task && a.task.title?String(a.task.title):'',
        from_value: wrapValue(a.from),
        to_value: wrapValue(a.to)
    })
}

async function addActivity(boardId, activity){
    await tx(async trx => {
        const id = await requireBoardRow(trx, boardId)
        await insertActivity(trx, id, activity)
        // Keep only the most recent MAX_ACTIVITIES.
        const keep = await trx('activity').where({board_id: id}).orderBy('seq', 'desc').limit(MAX_ACTIVITIES).select('seq')
        if(keep.length === MAX_ACTIVITIES){
            await trx('activity').where({board_id: id}).where('seq', '<', keep[keep.length - 1].seq).del()
        }
    })
}


/* ============================================ Papierkorb und Archiv == */

/**
 * Move something between the three lives.
 *
 * One function per table rather than one clever one: the key of a group is
 * (board_id, id) and that of a task is the same, but a board is just an id,
 * and a helper that hides that difference would be harder to read than the
 * three lines it saves.
 */
async function setBoardState(boardId, state, userId){
    const id = checkBoardId(boardId)
    await db()('board').where({id}).update({
        state, state_at: Date.now(), state_by: userId?sid(userId):null})
}

async function setGroupState(boardId, groupId, state, userId){
    const id = checkBoardId(boardId)
    await db()('board_group').where({board_id: id, id: sid(groupId)}).update({
        state, state_at: Date.now(), state_by: userId?sid(userId):null})
}

async function setTaskState(boardId, taskId, state, userId){
    const id = checkBoardId(boardId)
    await db()('task').where({board_id: id, id: sid(taskId)}).update({
        state, state_at: Date.now(), state_by: userId?sid(userId):null})
}

/**
 * What is in one bin of one board.
 *
 * Flat lists, not an assembled board: the point of this view is "what did I
 * throw away and when", and nesting the tasks under groups that are themselves
 * thrown away would ask the reader to hold two states at once.
 *
 * A task whose group is in the same bin is left out. It is not gone — putting
 * the group back brings it along — and listing it separately would offer a
 * restore that cannot work on its own.
 */
async function findBin(boardId, state){
    const id = checkBoardId(boardId)
    const k = db()

    const groups = await k('board_group')
        .where({board_id: id, state})
        .orderBy('state_at', 'desc')
        .select('id', 'title', 'color', 'icon', 'state_at', 'state_by')

    const tasks = await k('task as t')
        .leftJoin('board_group as g', function(){
            this.on('g.board_id', 't.board_id').andOn('g.id', 't.group_id')
        })
        .where({'t.board_id': id, 't.state': state})
        .where('g.state', ACTIVE)
        .orderBy('t.state_at', 'desc')
        .select('t.id', 't.title', 't.group_id', 't.parent_id', 't.state_at', 't.state_by',
            'g.title as group_title')

    const counts = await k('task')
        .where({board_id: id, state: ACTIVE})
        .whereIn('group_id', groups.map(g => g.id).length?groups.map(g => g.id):[''])
        .groupBy('group_id')
        .select('group_id')
        .count({n: '*'})
    const countByGroup = new Map(counts.map(r => [r.group_id, Number(r.n)]))

    return {
        groups: groups.map(g => ({
            id: g.id, title: g.title || '', color: g.color || '', icon: g.icon || '',
            taskCount: countByGroup.get(g.id) || 0,
            stateAt: g.state_at === null?null:Number(g.state_at),
            stateBy: g.state_by || null
        })),
        tasks: tasks.map(t => ({
            id: t.id, title: t.title || '', groupId: t.group_id,
            groupTitle: t.group_title || '', isSubtask: Boolean(t.parent_id),
            stateAt: t.state_at === null?null:Number(t.state_at),
            stateBy: t.state_by || null
        }))
    }
}

/**
 * Is this person on this board, right now?
 *
 * One row, no assembly. Serving a file asks this on every request, and reading
 * a whole board with its groups, tasks and comments to answer "may they" would
 * turn every image on a board into a full board read.
 */
/**
 * One person's role on one board, without assembling the board.
 *
 * `roleOf` in board.roles.js answers the same question from a board that has
 * already been read. This is for the callers that have not read one and should
 * not have to: a ticking timer or a click on an emoji must not cost a full
 * board with its groups, tasks and comments to find out whether it is allowed.
 */
async function roleOnBoard(boardId, userId){
    let id
    try {
        id = checkBoardId(boardId)
    } catch(err) {
        return null
    }
    const row = await db()('board_member')
        .where({board_id: id, user_id: sid(userId), state: ACTIVE})
        .first('role', 'is_owner')
    if(!row) return null
    return row.role || (row.is_owner?'owner':'editor')
}

async function isMember(boardId, userId){
    let id
    try {
        id = checkBoardId(boardId)
    } catch(err) {
        return false
    }
    const row = await db()('board_member')
        .where({board_id: id, user_id: sid(userId), state: ACTIVE})
        .first('user_id')
    return Boolean(row)
}

/**
 * One group row, whatever state it is in.
 *
 * The assembled board only carries active groups, so restoring one cannot ask
 * the board who created it — and "an editor may manage the group they created"
 * has to hold for putting it back too, or the rule has a hole exactly where
 * somebody is undoing a mistake.
 */
async function findGroupRow(boardId, groupId){
    const id = checkBoardId(boardId)
    const row = await db()('board_group').where({board_id: id, id: sid(groupId)}).first()
    if(!row) return null
    return {
        id: row.id, title: row.title || '', createdBy: row.created_by || null,
        state: row.state || ACTIVE
    }
}

/** One task row, whatever state it is in. */
async function findTaskRow(boardId, taskId){
    const id = checkBoardId(boardId)
    const row = await db()('task').where({board_id: id, id: sid(taskId)}).first()
    if(!row) return null
    return {
        id: row.id, title: row.title || '', groupId: row.group_id,
        parentId: row.parent_id || null, state: row.state || ACTIVE
    }
}

/** Hard delete, for emptying a bin. The only place a row really goes away. */
async function purgeGroup(boardId, groupId){
    const id = checkBoardId(boardId)
    await db()('board_group').where({board_id: id, id: sid(groupId)}).del()
}

async function purgeTask(boardId, taskId){
    const id = checkBoardId(boardId)
    await db()('task').where({board_id: id, id: sid(taskId)}).del()
}

/** Boards in one bin that this person is allowed to see. */
async function findBoardsByState(user, state){
    if(!user) return []
    const k = db()
    let q = k('board').where('state', state)
    if(!user.isAdmin){
        q = q.whereIn('id', k('board_member').select('board_id')
            .where({user_id: sid(user._id), state: ACTIVE}))
    }
    const rows = await q.orderBy('state_at', 'desc').select('id', 'title', 'state_at', 'state_by')
    return rows.map(r => ({
        _id: r.id, title: r.title || '',
        stateAt: r.state_at === null?null:Number(r.state_at),
        stateBy: r.state_by || null
    }))
}

module.exports = {
    addComment, newTaskId: newShortId,
    findById, findForUser, insert, deleteById,
    updateMeta, setColumns, setMembers, setMemberRole, setOwners,
    addGroup, removeGroup, updateGroupMeta, replaceGroup, reorderGroups,
    addTask, addSubtask, setSubtasks, setTaskParent, removeTask, updateTaskFields, replaceTask, setGroupTasks, moveTask,
    addActivity,
    setBoardState, setGroupState, setTaskState, findBin, findBoardsByState,
    findGroupRow, findTaskRow, purgeGroup, purgeTask, isMember, roleOnBoard,
    ACTIVE, ARCHIVED, TRASHED, STATES,
    MAX_ACTIVITIES
}
