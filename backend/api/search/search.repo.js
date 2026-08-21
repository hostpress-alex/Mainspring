/**
 * The queries behind the global search.
 *
 * ## The one rule
 *
 * Permission is part of every query, never a filter applied afterwards. Each
 * of these joins against `board_member` (or, for people, against the boards
 * you share), so a row you may not see cannot be in the result set to begin
 * with. "Fetch everything, then remove what they may not have" is one
 * forgotten line away from showing somebody another team's task titles, and
 * the forgotten line looks exactly like working code.
 *
 * An administrator is exempt, the same way they are an owner everywhere else —
 * see board.roles.js.
 *
 * ## What is deliberately not searched
 *
 * Anything in the bin or the archive. Search is for finding what you are
 * working on; a thrown-away task turning up in the results makes the bin
 * pointless. The bin has its own list.
 *
 * Files that hang off no task. That is where profile pictures live, and a
 * search that turns up other people's uploads because they share a table with
 * attachments is a leak, not a feature.
 *
 * ## Speed
 *
 * `LIKE '%needle%'` cannot use an index — it reads the table. For a tool for
 * fifteen people and a few thousand rows that is the right trade against a
 * full-text index that has to be kept in step. If this ever gets slow the
 * answer is FULLTEXT on the three text columns, not a cleverer LIKE.
 */
const {db} = require('../../db/knex')

const sid = v => (v === undefined || v === null)?'':String(v)

const ACTIVE = 'active'

/** How many of each kind one search returns. */
const PER_TYPE = 8

/**
 * The needle for a LIKE, with its wildcards taken away.
 *
 * Without this a search for "50%" matches everything, and one for "_" matches
 * every single-character title.
 */
function needle(term){
    return '%' + String(term).toLowerCase().replace(/[%_\\]/g, ch => '\\' + ch) + '%'
}

/** The boards this person is on. Everything else hangs off this. */
function myBoardIds(k, user){
    // `state` as well as the id: somebody taken off a board keeps their row,
    // and without this they would keep searching it too.
    return k('board_member').select('board_id')
        .where({user_id: sid(user._id), state: ACTIVE})
}

/** `true` for an administrator, otherwise the membership condition. */
function onlyMine(q, user, column = 'b.id'){
    if(user && user.isAdmin) return q
    return q.whereIn(column, myBoardIds(db(), user))
}

async function boards(user, term, limit = PER_TYPE){
    const q = db()('board as b')
        .where('b.state', ACTIVE)
        .whereRaw('LOWER(b.title) LIKE ?', [needle(term)])
        .orderBy('b.title')
        .limit(limit)
        .select('b.id', 'b.title')
    const rows = await onlyMine(q, user)
    return rows.map(r => ({_id: r.id, title: r.title || ''}))
}

/**
 * Tasks and subtasks.
 *
 * The group is joined so a task in a thrown-away group cannot appear — the
 * task itself is still `active`, it is only invisible because its parent is
 * not, which is the visibility rule from the lifecycle migration written out
 * in SQL.
 */
async function tasks(user, term, limit = PER_TYPE){
    const q = db()('task as t')
        .join('board as b', 'b.id', 't.board_id')
        .leftJoin('board_group as g', function(){
            this.on('g.board_id', 't.board_id').andOn('g.id', 't.group_id')
        })
        .where('t.state', ACTIVE)
        .where('b.state', ACTIVE)
        .where(function(){
            this.where('g.state', ACTIVE).orWhereNull('g.id')
        })
        .whereRaw('LOWER(t.title) LIKE ?', [needle(term)])
        .orderBy('t.updated_at', 'desc')
        .limit(limit)
        .select('t.id', 't.title', 't.group_id', 't.parent_id', 't.board_id',
            'b.title as board_title', 'g.title as group_title')
    const rows = await onlyMine(q, user)
    return rows.map(r => ({
        id: r.id, title: r.title || '',
        boardId: r.board_id, boardTitle: r.board_title || '',
        groupId: r.group_id, groupTitle: r.group_title || '',
        isSubtask: Boolean(r.parent_id)
    }))
}

/** Updates and replies. The text is HTML — the service cleans it up. */
async function updates(user, term, limit = PER_TYPE){
    const q = db()('task_comment as c')
        .join('task as t', function(){
            this.on('t.board_id', 'c.board_id').andOn('t.id', 'c.task_id')
        })
        .join('board as b', 'b.id', 'c.board_id')
        // The author's name is read from the user table, not from a copy on
        // the comment. There WAS such a copy — `c.by_user_name` — and this
        // query still selected it after migration 000015 dropped it, so every
        // search answered 500 with "Unknown column 'c.by_user_name'". Not the
        // update search: the WHOLE search, because the five kinds are gathered
        // in one call. A LEFT join, because the author may be null on updates
        // written before the author was recorded at all.
        .leftJoin('user as u', 'u.id', 'c.by_user_id')
        .where('t.state', ACTIVE)
        .where('b.state', ACTIVE)
        .whereRaw('LOWER(c.txt) LIKE ?', [needle(term)])
        .orderBy('c.created_at', 'desc')
        // More than asked for: the service throws away the ones that only
        // matched inside a tag, and would otherwise come back short.
        .limit(limit * 4)
        .select('c.id', 'c.txt', 'c.created_at', 'u.fullname as by_name', 'c.task_id',
            'c.board_id', 't.title as task_title', 't.group_id', 'b.title as board_title')
    const rows = await onlyMine(q, user)
    return rows.map(r => ({
        id: r.id, txt: r.txt || '',
        taskId: r.task_id, taskTitle: r.task_title || '',
        groupId: r.group_id,
        boardId: r.board_id, boardTitle: r.board_title || '',
        byName: r.by_name || '',
        at: r.created_at === null?null:Number(r.created_at)
    }))
}

/**
 * Attachments, by their original name.
 *
 * Only files that hang off a task: that is the only way this table says which
 * board something belongs to, and it is what keeps profile pictures — which
 * live in the same table with no task — out of the results.
 *
 * The join is on `task_id` alone because `file` carries no board id. Task ids
 * are random, so two boards sharing one is not a real prospect; it is written
 * down here because a permission join that relies on "unlikely" deserves to
 * be found by whoever adds a board id to this table.
 */
async function files(user, term, limit = PER_TYPE){
    const q = db()('file as f')
        .join('task as t', 't.id', 'f.task_id')
        .join('board as b', 'b.id', 't.board_id')
        .whereNotNull('f.task_id')
        .where('t.state', ACTIVE)
        .where('b.state', ACTIVE)
        .whereRaw('LOWER(f.original_name) LIKE ?', [needle(term)])
        .orderBy('f.created_at', 'desc')
        .limit(limit)
        .select('f.id', 'f.original_name', 'f.mime', 'f.size', 'f.task_id',
            't.title as task_title', 't.group_id', 't.board_id', 'b.title as board_title')
    const rows = await onlyMine(q, user)
    return rows.map(r => ({
        id: r.id, name: r.original_name || '', mime: r.mime || '', size: Number(r.size || 0),
        taskId: r.task_id, taskTitle: r.task_title || '', groupId: r.group_id,
        boardId: r.board_id, boardTitle: r.board_title || ''
    }))
}

/**
 * People you share a board with.
 *
 * Not every user in the database. The list of everyone who has an account is
 * not a search result, it is a staff directory — and one that a search box
 * should not hand out to whoever types a letter.
 */
async function people(user, term, limit = PER_TYPE){
    const k = db()
    const like = needle(term)
    let q = k('user as u')
        .where(function(){
            this.whereRaw('LOWER(u.fullname) LIKE ?', [like])
                .orWhereRaw('LOWER(u.username) LIKE ?', [like])
        })
        .where('u.state', ACTIVE)
        .orderBy('u.fullname')
        .limit(limit)
        .distinct('u.id', 'u.fullname', 'u.username', 'u.img_url')

    if(!(user && user.isAdmin)){
        q = q.join('board_member as m', 'm.user_id', 'u.id')
            .where('m.state', ACTIVE)
            .whereIn('m.board_id', myBoardIds(k, user))
    }
    const rows = await q
    return rows.map(r => ({
        _id: r.id, fullname: r.fullname || '', username: r.username || '', imgUrl: r.img_url || ''
    }))
}

module.exports = {PER_TYPE, boards, tasks, updates, files, people}
