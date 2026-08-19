/**
 * Storage access for read receipts.
 */
const {db} = require('../../db/knex')

const sid = v => (v === undefined || v === null)?'':String(v)

/** Everything on one task, as rows — the shaping happens in the controller. */
async function findForTask(boardId, taskId){
    return await db()('comment_seen')
        .where({board_id: sid(boardId), task_id: sid(taskId)})
        .orderBy('seen_at', 'asc')
        .select('comment_id', 'user_id', 'seen_at')
}

/**
 * Record that this person has seen these comments.
 *
 * `ignore` on conflict, not `merge`: the first time somebody saw something is
 * the interesting one, and a second look must not quietly move it forwards.
 *
 * The author of a comment is left out here rather than at the call site. The
 * client would have to be trusted to leave itself out otherwise, and "seen by
 * 4" that includes the person who wrote it is a number nobody can use.
 *
 * Returns the ids that were actually new, so the caller only tells the room
 * about something that changed.
 */
async function markSeen({boardId, taskId, commentIds, userId, at = Date.now()}){
    const ids = [...new Set((commentIds || []).map(sid).filter(Boolean))]
    if(!ids.length) return []

    // Only comments that exist on this task, and not the reader's own.
    const rows = await db()('task_comment')
        .where({board_id: sid(boardId), task_id: sid(taskId)})
        .whereIn('id', ids)
        .select('id', 'by_user_id')
    const wanted = rows
        .filter(row => sid(row.by_user_id) !== sid(userId))
        .map(row => row.id)
    if(!wanted.length) return []

    const already = await db()('comment_seen')
        .where({board_id: sid(boardId), task_id: sid(taskId), user_id: sid(userId)})
        .whereIn('comment_id', wanted)
        .pluck('comment_id')
    const fresh = wanted.filter(id => !already.includes(id))
    if(!fresh.length) return []

    await db()('comment_seen').insert(fresh.map(commentId => ({
        board_id: sid(boardId), task_id: sid(taskId),
        comment_id: commentId, user_id: sid(userId), seen_at: at
    }))).onConflict(['board_id', 'task_id', 'comment_id', 'user_id']).ignore()

    return fresh
}

module.exports = {findForTask, markSeen}
