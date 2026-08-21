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
         * **Both audiences, one delivery.** The row on the board shows a count
         * and the open dialog shows the reaction itself, so both want this. It
         * used to be two separate emits, with a note here saying a socket sits
         * in exactly one of the two rooms and which one was a race. That race
         * is gone (HANDOVER §6 is done), and two emits would now arrive twice
         * at every client that has the dialog open — so it is one call to the
         * union of the rooms.
         */
        const payload = [{boardId, taskId, commentId, emoji, by: String(user._id)}]
        sockets().emitToBoardAndTask({type: REACTION_CHANGED, boardId, taskId, args: payload})

        // Only when it goes on. Being told that somebody took a thumb back is
        // a notification nobody wants.
        if(on) await notifications().commentReacted({boardId, taskId, commentId, emoji, actor: user})

        return {emoji, on}
    }, 'Could not save the reaction')
}
