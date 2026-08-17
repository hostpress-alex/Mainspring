/**
 * The notification endpoints.
 *
 * Everything here is scoped to the logged-in user by construction: the user id
 * comes from the session, never from the request, so there is no way to ask
 * for somebody else's list.
 */
const notificationRepo = require('./notification.repo')
const notificationService = require('./notification.service')
const asyncLocalStorage = require('../../services/als.service')
const logger = require('../../services/logger.service')

function requester(){
    const store = asyncLocalStorage.getStore()
    return (store && store.loggedinUser) || null
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
    /** Newest first. `before` is the id of the oldest entry already shown. */
    list: handler(async (req, user) => {
        const rows = await notificationRepo.findForUser(user._id, {
            before: req.query.before || null,
            limit: req.query.limit || 30
        })
        // The rows carry an actor id; who that is comes from the user table on
        // the way out rather than from a copy written when it happened.
        const items = await notificationService.withPeople(rows)
        return {items, unread: await notificationRepo.countUnread(user._id)}
    }, 'Benachrichtigungen konnten nicht geladen werden'),

    /** Just the number, for the badge. */
    unread: handler(async (req, user) =>
        ({unread: await notificationRepo.countUnread(user._id)}),
    'Anzahl konnte nicht geladen werden'),

    markRead: handler(async (req, user) => {
        const ids = Array.isArray(req.body && req.body.ids)?req.body.ids:[]
        const changed = await notificationRepo.markRead(user._id, ids, Date.now())
        return {changed, unread: await notificationRepo.countUnread(user._id)}
    }, 'Konnte nicht als gelesen markiert werden'),

    markAllRead: handler(async (req, user) => {
        const changed = await notificationRepo.markAllRead(user._id, Date.now())
        return {changed, unread: 0}
    }, 'Konnte nicht als gelesen markiert werden'),

    /**
     * Turn notifications for one task on or off.
     *
     * The mute is stored rather than the row deleted, so a later assignment
     * does not quietly sign the user up again.
     */
    setMuted: handler(async (req, user) => {
        const {boardId, taskId} = req.params
        const muted = !!(req.body && req.body.muted)
        await notificationRepo.setMuted(boardId, taskId, user._id, muted, Date.now())
        return {boardId, taskId, muted}
    }, 'Abo konnte nicht geaendert werden'),

    isMuted: handler(async (req, user) => {
        const {boardId, taskId} = req.params
        return {muted: await notificationRepo.isMuted(boardId, taskId, user._id)}
    }, 'Abo konnte nicht gelesen werden')
}
