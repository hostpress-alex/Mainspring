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
const TASK_OWN = new Set(['id', 'title', 'memberIds', 'comments'])

function buildColumn(row){
    return {id: row.id, type: row.type, title: row.title, field: row.field, ...(parseJson(row.settings, {}) || {})}
}

function buildTask(row, memberIds, comments){
    const values = parseJson(row.col_values, {}) || {}
    return {...values, id: row.id, title: row.title === null?'':row.title, memberIds, comments}
}

function buildComment(row){
    return {
        id: row.id,
        parentId: row.parent_id || null,
        txt: row.txt === null?'':row.txt,
        archivedAt: row.created_at === null?null:Number(row.created_at),
        byMember: {_id: row.by_user_id || null, fullname: row.by_user_name || '', imgUrl: row.by_user_img || ''},
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
        byMember: parseJson(row.by_member, {}) || {},
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

    const members = await k('board_member').whereIn('board_id', ids).orderBy('board_id').orderBy('position')
    const columns = await k('board_column').whereIn('board_id', ids).orderBy('board_id').orderBy('position')
    const groups = await k('board_group').whereIn('board_id', ids).orderBy('board_id').orderBy('position')
    const tasks = await k('task').whereIn('board_id', ids).orderBy('board_id').orderBy('position')
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
        const tasksOfBoard = bucket(tasksByBoard.get(row.id) || [], r => r.group_id)

        return {
            _id: row.id,
            title: row.title === null?'':row.title,
            description: row.description === null?'':row.description,
            folder: row.folder || '',
            isStarred: !!row.is_starred,
            archivedAt: row.archived_at === null?null:Number(row.archived_at),
            createdBy: {
                _id: row.created_by_id || '',
                fullname: row.created_by_name || '',
                imgUrl: row.created_by_img || ''
            },
            labels: parseJson(row.labels, []) || [],
            members: mem.map(m => ({_id: m.user_id, fullname: m.fullname, imgUrl: m.img_url})),
            ownerIds: mem.filter(m => m.is_owner).map(m => m.user_id),
            columns: (columnsByBoard.get(row.id) || []).map(buildColumn),
            groups: (groupsByBoard.get(row.id) || []).map(g => ({
                id: g.id,
                title: g.title === null?'':g.title,
                color: g.color || '',
                archivedAt: g.archived_at === null?null:Number(g.archived_at),
                tasks: (tasksOfBoard.get(g.id) || []).map(t => buildTask(
                    t,
                    (membersByTask.get(t.board_id + ' ' + t.id) || []).map(m => m.user_id),
                    (commentsByTask.get(t.board_id + ' ' + t.id) || []).map(buildComment)
                ))
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
    let q = k('board').select('board.*')
    if(!user.isAdmin){
        q = q.whereIn('board.id', k('board_member').select('board_id').where('user_id', sid(user._id)))
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

async function nextPosition(trx, table, where){
    const row = await trx(table).where(where).max({m: 'position'}).first()
    return (row && row.m !== null && row.m !== undefined)?Number(row.m) + 1:0
}

async function shiftPositions(trx, table, where, fromPosition){
    await trx(table).where(where).where('position', '>=', fromPosition).increment('position', 1)
}

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
        updatedById: updatedBy._id?sid(updatedBy._id):null,
        updatedByImg: typeof updatedBy.imgUrl === 'string'?updatedBy.imgUrl:''
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

async function syncTaskComments(trx, boardId, taskId, comments){
    await trx('task_comment').where({board_id: boardId, task_id: taskId}).del()
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
            by_user_id: by._id?sid(by._id):null,
            by_user_name: by.fullname || '',
            by_user_img: by.imgUrl || '',
            txt: (c && c.txt) || '',
            style: toJson((c && c.style) || {}),
            attachments: toJson((c && c.attachments) || [])
        })
    })
    await trx('task_comment').insert(rows)
}

/** Write a whole task (create or replace). */
async function writeTask(trx, boardId, groupId, task, position){
    const s = splitTask(task)
    const id = sid(task && task.id) || newShortId()
    await trx('task').insert({
        board_id: boardId, id, group_id: groupId, position,
        title: s.title, col_values: toJson(s.values),
        updated_at: s.updatedAt, updated_by_id: s.updatedById, updated_by_img: s.updatedByImg
    }).onConflict(['board_id', 'id']).merge()
    await syncTaskMembers(trx, boardId, id, s.memberIds)
    await syncTaskComments(trx, boardId, id, s.comments)
    return id
}

/** Bring the tasks of a group to the given list. */
async function syncGroupTasks(trx, boardId, groupId, tasks){
    const wanted = tasks.map(t => sid(t.id)).filter(Boolean)
    const existing = await trx('task').where({board_id: boardId, group_id: groupId}).select('id')
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

async function writeMembers(trx, boardId, members, ownerIds){
    const owners = new Set((ownerIds || []).map(sid))
    await trx('board_member').where({board_id: boardId}).del()
    const list = (members || []).filter(m => m && m._id)
    if(!list.length) return
    const seen = new Set()
    const rows = []
    list.forEach((m, i) => {
        const userId = sid(m._id)
        if(seen.has(userId)) return
        seen.add(userId)
        rows.push({
            board_id: boardId, user_id: userId, position: i,
            is_owner: owners.has(userId),
            fullname: m.fullname || '', img_url: m.imgUrl || ''
        })
    })
    await trx('board_member').insert(rows)
}

function boardMetaRow(board){
    const createdBy = board.createdBy || {}
    return {
        title: board.title || '',
        description: board.description || '',
        folder: board.folder || '',
        is_starred: !!board.isStarred,
        created_by_id: createdBy._id?sid(createdBy._id):null,
        created_by_name: createdBy.fullname || '',
        created_by_img: createdBy.imgUrl || '',
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

async function setMembers(boardId, members){
    await tx(async trx => {
        const id = await requireBoardRow(trx, boardId)
        const current = await trx('board_member').where({board_id: id}).select('user_id', 'is_owner')
        const owners = current.filter(r => r.is_owner).map(r => r.user_id)
        await writeMembers(trx, id, members, owners)
    })
}

async function setOwners(boardId, ownerIds){
    await tx(async trx => {
        const id = await requireBoardRow(trx, boardId)
        const wanted = (ownerIds || []).map(sid)
        await trx('board_member').where({board_id: id}).update({is_owner: false})
        if(wanted.length){
            await trx('board_member').where({board_id: id}).whereIn('user_id', wanted).update({is_owner: true})
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

const GROUP_META_FIELDS = {title: 'title', color: 'color', archivedAt: 'archived_at'}

async function updateGroupMeta(boardId, groupId, patch){
    const update = {}
    for(const [key, column] of Object.entries(GROUP_META_FIELDS)){
        if(patch[key] === undefined) continue
        if(key === 'archivedAt') update[column] = Number.isFinite(Number(patch[key]))?Number(patch[key]):null
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

async function addTask(boardId, groupId, task, index = null){
    await tx(async trx => {
        const id = await requireBoardRow(trx, boardId)
        await requireGroupRow(trx, id, groupId)
        let position
        if(index === null || index === undefined){
            position = await nextPosition(trx, 'task', {board_id: id, group_id: groupId})
        } else {
            position = Number(index)
            await shiftPositions(trx, 'task', {board_id: id, group_id: groupId}, position)
        }
        await writeTask(trx, id, groupId, task, position)
    })
}

async function removeTask(boardId, groupId, taskId){
    const id = checkBoardId(boardId)
    await db()('task').where({board_id: id, group_id: groupId, id: taskId}).del()
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
            values[key] = value
            touchesValues = true
            if(key === 'updatedBy'){
                const by = value || {}
                update.updated_at = Number.isFinite(Number(by.date))?Number(by.date):null
                update.updated_by_id = by._id?sid(by._id):null
                update.updated_by_img = typeof by.imgUrl === 'string'?by.imgUrl:''
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
        await writeTask(trx, id, row.group_id, {...task, id: taskId}, row.position)
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

        let position
        if(index === null || index === undefined){
            position = await nextPosition(trx, 'task', {board_id: id, group_id: toGroupId})
        } else {
            position = Number(index)
            await shiftPositions(trx, 'task', {board_id: id, group_id: toGroupId}, position)
        }
        await trx('task').where({board_id: id, id: taskId}).update({group_id: toGroupId, position})
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
        by_member: toJson(a.byMember || {}),
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

module.exports = {
    findById, findForUser, insert, deleteById,
    updateMeta, setColumns, setMembers, setOwners,
    addGroup, removeGroup, updateGroupMeta, replaceGroup, reorderGroups,
    addTask, removeTask, updateTaskFields, replaceTask, setGroupTasks, moveTask,
    addActivity,
    MAX_ACTIVITIES
}
