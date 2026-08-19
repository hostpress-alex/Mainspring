/**
 * Storage access for reactions on updates and replies.
 */
const {db} = require('../../db/knex')

const sid = v => (v === undefined || v === null)?'':String(v)

/** Everything on one task, as rows — the shaping happens in the controller. */
async function findForTask(boardId, taskId){
    return await db()('comment_reaction')
        .where({board_id: sid(boardId), task_id: sid(taskId)})
        .orderBy('created_at', 'asc')
        .select('comment_id', 'user_id', 'emoji', 'created_at')
}

/**
 * On if it was off, off if it was on.
 *
 * A toggle rather than separate add and remove routes: the button is the same
 * button either way, and a client that has to know the current state first
 * would be wrong the moment somebody else clicked at the same time.
 *
 * Returns true when the reaction is now set.
 */
async function toggle({boardId, taskId, commentId, userId, emoji}){
    const key = {
        board_id: sid(boardId), comment_id: sid(commentId),
        user_id: sid(userId), emoji
    }
    const existing = await db()('comment_reaction').where(key).first('emoji')
    if(existing){
        await db()('comment_reaction').where(key).del()
        return false
    }
    await db()('comment_reaction').insert({...key, task_id: sid(taskId), created_at: Date.now()})
    return true
}

/** Does this comment exist on this task — the emoji must land on something. */
async function commentExists(boardId, taskId, commentId){
    const row = await db()('task_comment')
        .where({board_id: sid(boardId), task_id: sid(taskId), id: sid(commentId)})
        .first('id')
    return Boolean(row)
}

/**
 * Everything a notification about this reaction needs, in three reads.
 *
 * Who wrote the comment, whether it was a reply, and where the task sits —
 * the route to a task is /board/:boardId/:groupId/:taskId, so the group has to
 * travel with the notification or the click can only reach the board.
 *
 * Two different parents, and mixing them up sends people to the wrong place:
 * `replyTo` is the *comment* this one hangs under, and only says whether the
 * reaction landed on an update or on a reply. `taskParentId` is the task above
 * this one — a subtask has no dialog of its own, so a link to it has to open
 * the parent task instead.
 */
async function commentContext(boardId, taskId, commentId){
    const comment = await db()('task_comment')
        .where({board_id: sid(boardId), task_id: sid(taskId), id: sid(commentId)})
        .first('by_user_id', 'parent_id', 'txt')
    if(!comment) return null

    const task = await db()('task')
        .where({board_id: sid(boardId), id: sid(taskId)})
        .first('title', 'group_id', 'parent_id')

    const board = await db()('board').where({id: sid(boardId)}).first('title')

    return {
        authorId: comment.by_user_id || null,
        replyTo: comment.parent_id || null,
        txt: comment.txt || '',
        taskTitle: task?(task.title || ''):'',
        groupId: task?task.group_id:null,
        taskParentId: task?(task.parent_id || null):null,
        boardTitle: board?(board.title || ''):''
    }
}

module.exports = {findForTask, toggle, commentExists, commentContext}
