/**
 * Read receipts over HTTP.
 *
 * Who is reading is the session's user, never a field in the request — the
 * one thing that must not be forgeable here.
 *
 * Reading the list needs board membership, and everybody who may see the
 * update may see who else has. That was a decision, not an oversight: the
 * alternative (only the author sees the names) was on the table and turned
 * down in favour of what Monday does.
 */
const seenRepo = require('./seen.repo')
const boardRepo = require('../board/board.repo')
const asyncLocalStorage = require('../../services/als.service')
const logger = require('../../services/logger.service')

/** Late, like everything else that touches sockets. */
const sockets = () => require('../../services/socket.service')

const SEEN_CHANGED = 'seen-changed'

/** One request may not announce more than a screenful. */
const MAX_PER_CALL = 60

function requester(){
    const store = asyncLocalStorage.getStore()
    return (store && store.loggedinUser) || null
}

async function requireMember(boardId, user){
    if(user.isAdmin) return 'owner'
    const role = await boardRepo.roleOnBoard(boardId, user._id)
    if(!role){
        const err = new Error('Board not found')
        err.status = 404
        throw err
    }
    return role
}

const handler = (fn, fallback) => async (req, res) => {
    try {
        const user = requester()
        if(!user) return res.status(401).send({err: 'Not Authenticated'})
        res.json(await fn(req, user))
    } catch(err){
        if(!err.status) logger.error(fallback, err)
        res.status(err.status || 500).send({err: err.status?err.message:fallback})
    }
}

module.exports = {
    /** Every receipt on one task, grouped by comment. */
    forTask: handler(async (req, user) => {
        const {boardId, taskId} = req.params
        await requireMember(boardId, user)
        const rows = await seenRepo.findForTask(boardId, taskId)

        const byComment = {}
        for(const row of rows){
            (byComment[row.comment_id] = byComment[row.comment_id] || []).push({
                userId: row.user_id,
                seenAt: row.seen_at === null?null:Number(row.seen_at)
            })
        }
        return {seen: byComment}
    }, 'Could not read the receipts'),

    /**
     * "These have been on my screen."
     *
     * A list rather than one id per call: a person scrolling through a task
     * sees five updates in two seconds, and five requests for that would be
     * five requests too many. The client collects them and sends once.
     */
    mark: handler(async (req, user) => {
        const {boardId, taskId} = req.params
        await requireMember(boardId, user)

        const commentIds = ((req.body || {}).commentIds || []).slice(0, MAX_PER_CALL)
        const fresh = await seenRepo.markSeen({boardId, taskId, commentIds, userId: user._id})
        if(!fresh.length) return {added: 0}

        // Both audiences, one delivery — see reaction.controller. A socket may
        // hold the board room and the task room at once now, so sending twice
        // would arrive twice.
        const payload = [{boardId, taskId, commentIds: fresh, by: String(user._id)}]
        sockets().emitToBoardAndTask({type: SEEN_CHANGED, boardId, taskId, args: payload})

        return {added: fresh.length}
    }, 'Could not save the receipt')
}
