/**
 * Storage access for notifications and task subscriptions.
 */
const {db, parseJson, toJson} = require('../../db/knex')

const sid = v => (v === undefined || v === null)?'':String(v)

function out(row){
    if(!row) return null
    return {
        id: Number(row.seq),
        kind: row.kind,
        boardId: row.board_id,
        boardTitle: row.board_title || '',
        taskId: row.task_id || null,
        subject: row.subject === null?'':row.subject,
        detail: parseJson(row.detail, {}) || {},
        // The id alone. Who that is gets looked up when the list is read —
        // see withPeople in notification.service.js.
        actor: {_id: row.actor_id || null},
        createdAt: Number(row.created_at),
        readAt: row.read_at === null?null:Number(row.read_at)
    }
}

/* ------------------------------------------------------------- writing -- */

/** One row per recipient. Returns the rows as the client will see them. */
async function insertMany(entries){
    if(!entries.length) return []
    const rows = entries.map(e => ({
        user_id: sid(e.userId),
        actor_id: e.actor && e.actor._id?sid(e.actor._id):null,
        kind: e.kind,
        board_id: sid(e.boardId),
        board_title: e.boardTitle || '',
        task_id: e.taskId?sid(e.taskId):null,
        subject: e.subject || '',
        detail: toJson(e.detail || {}),
        created_at: e.createdAt
    }))

    const [firstSeq] = await db()('notification').insert(rows)
    // MySQL returns the id of the FIRST inserted row for a bulk insert, and
    // the rest follow consecutively. Reading them back would be a second
    // round trip for something we already know.
    return rows.map((row, i) => out({...row, seq: firstSeq + i, read_at: null}))
}

/* ------------------------------------------------------------- reading -- */

async function findForUser(userId, {before = null, limit = 30} = {}){
    let q = db()('notification').where({user_id: sid(userId)})
    if(before) q = q.where('seq', '<', Number(before))
    const rows = await q.orderBy('seq', 'desc').limit(Math.min(Number(limit) || 30, 100))
    return rows.map(out)
}

/**
 * Recent rows of one kind for one person — enough to tell whether an event is
 * a repeat of one already sent. Only the two fields that identify it come
 * back; this runs on the write path and has no business reading whole rows.
 */
async function findRecent(userId, kind, since){
    const rows = await db()('notification')
        .where({user_id: sid(userId), kind})
        .where('created_at', '>=', Number(since))
        .select('actor_id', 'detail')
    return rows.map(row => ({
        actorId: row.actor_id || null,
        detail: parseJson(row.detail, {}) || {}
    }))
}

async function countUnread(userId){
    const row = await db()('notification')
        .where({user_id: sid(userId)}).whereNull('read_at')
        .count({n: '*'}).first()
    return Number((row && row.n) || 0)
}

async function markRead(userId, ids, at){
    if(!ids.length) return 0
    return await db()('notification')
        .where({user_id: sid(userId)}).whereIn('seq', ids.map(Number)).whereNull('read_at')
        .update({read_at: at})
}

async function markAllRead(userId, at){
    return await db()('notification')
        .where({user_id: sid(userId)}).whereNull('read_at')
        .update({read_at: at})
}

/* ------------------------------------------------------- subscriptions -- */

/** Everyone listening to this task, muted ones already filtered out. */
async function subscribersOf(boardId, taskId){
    const rows = await db()('task_subscription')
        .where({board_id: sid(boardId), task_id: sid(taskId), muted: false})
        .select('user_id')
    return rows.map(r => r.user_id)
}

/**
 * Subscribe, unless the user has said no before.
 *
 * `ignore` rather than `merge`: an existing row may be a mute, and being
 * assigned to a task again is not a reason to overrule that.
 */
async function subscribe(boardId, taskId, userIds, at){
    const ids = [...new Set(userIds.map(sid).filter(Boolean))]
    if(!ids.length) return
    await db()('task_subscription').insert(ids.map(userId => ({
        board_id: sid(boardId), task_id: sid(taskId), user_id: userId,
        muted: false, created_at: at
    }))).onConflict(['board_id', 'task_id', 'user_id']).ignore()
}

/** Explicit on/off by the user. This one does overwrite. */
async function setMuted(boardId, taskId, userId, muted, at){
    await db()('task_subscription').insert({
        board_id: sid(boardId), task_id: sid(taskId), user_id: sid(userId),
        muted: !!muted, created_at: at
    }).onConflict(['board_id', 'task_id', 'user_id']).merge(['muted'])
}

async function isMuted(boardId, taskId, userId){
    const row = await db()('task_subscription')
        .where({board_id: sid(boardId), task_id: sid(taskId), user_id: sid(userId)})
        .first('muted')
    return !!(row && row.muted)
}

module.exports = {
    insertMany,
    findForUser,
    findRecent,
    countUnread,
    markRead,
    markAllRead,
    subscribersOf,
    subscribe,
    setMuted,
    isMuted
}
