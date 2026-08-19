/**
 * Reactions on updates and replies.
 *
 * Who reacted is the session's user, never a field in the request.
 *
 * Reading needs membership; reacting needs no more than that. A viewer may
 * already reply to an update — an emoji says strictly less than a sentence, so
 * forbidding it while allowing the sentence would be a rule nobody could
 * explain.
 */
const reactionRepo = require('./reaction.repo')
const boardRepo = require('../board/board.repo')
const asyncLocalStorage = require('../../services/als.service')
const logger = require('../../services/logger.service')

/**
 * Required late, like everywhere else in this codebase that touches sockets:
 * the socket service pulls in the board layer, and a controller that is loaded
 * while the routes are being wired must not drag that graph in with it.
 */
const sockets = () => require('../../services/socket.service')
const notifications = () => require('../notification/notification.service')

/** Everyone with this task open hears that its reactions moved. */
const REACTION_CHANGED = 'reaction-changed'

/**
 * The set is fixed here as well as in the frontend.
 *
 * Not because the client cannot be trusted with an emoji, but because a column
 * that accepts anything fills up with one-offs nobody can scan, and the whole
 * value of a reaction is that the same few symbols repeat.
 */
const ALLOWED = ['👍', '👏', '🙏', '❤️', '😄', '✅']

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
    ALLOWED,

    /**
     * Every reaction on a task, grouped by comment and emoji.
     *
     * `mine` travels per group rather than as a second list: the button has to
     * know whether to look pressed, and working that out in the browser by
     * searching a list of user ids is the same answer computed later and worse.
     */
    forTask: handler(async (req, user) => {
        const {boardId, taskId} = req.params
        await requireMember(boardId, user)
        const rows = await reactionRepo.findForTask(boardId, taskId)

        const byComment = {}
        for(const row of rows){
            const forComment = byComment[row.comment_id] || (byComment[row.comment_id] = {})
            const group = forComment[row.emoji] || (forComment[row.emoji] = {count: 0, mine: false, userIds: []})
            group.count++
            group.userIds.push(row.user_id)
            if(String(row.user_id) === String(user._id)) group.mine = true
        }
        return {reactions: byComment}
    }, 'Could not read the reactions'),

    toggle: handler(async (req, user) => {
        const {boardId, taskId, commentId} = req.params
        const emoji = (req.body || {}).emoji
        if(!ALLOWED.includes(emoji)){
            const err = new Error('Unknown reaction')
            err.status = 400
            throw err
        }
        await requireMember(boardId, user)
        if(!await reactionRepo.commentExists(boardId, taskId, commentId)){
            const err = new Error('Update not found')
            err.status = 404
            throw err
        }
        const on = await reactionRepo.toggle({boardId, taskId, commentId, userId: user._id, emoji})

        /**
         * Told, not sent.
         *
         * The event carries only which task changed, and every open dialog
         * asks for the new state itself. Shipping the delta would mean each
         * client applying an edit that crossed with its own — the same
         * client-to-client relay this codebase removed from the board once
         * already. One extra request per reaction, for fifteen people.
         *
         * **Both rooms, and that is not belt-and-braces.** A socket is only
         * ever in one of them, and which one depends on the order two effects
         * happened to run in on that client: opening a task from the board
         * leaves the socket in the task's room, but a reload or a direct link
         * puts the board back on top of it. So one browser hears task events
         * and the next one board events, with nothing to tell them apart from
         * the outside. Sending to both costs one line and stops the feature
         * from depending on that race. The proper repair — one socket holding
         * both rooms — is HANDOVER §6 and a job of its own.
         */
        const payload = [{boardId, taskId, commentId, emoji, by: String(user._id)}]
        sockets().emitToTask({type: REACTION_CHANGED, boardId, taskId, args: payload})
        sockets().emitToBoard({type: REACTION_CHANGED, boardId, args: payload})

        // Only when it goes on. Being told that somebody took a thumb back is
        // a notification nobody wants.
        if(on) await notifications().commentReacted({boardId, taskId, commentId, emoji, actor: user})

        return {emoji, on}
    }, 'Could not save the reaction')
}
