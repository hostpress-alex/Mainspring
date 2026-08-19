/**
 * The outside calendar over HTTP.
 *
 * One rule runs through all of it: events are read by the person they belong
 * to. There is deliberately no route that returns somebody else's events, not
 * even for an admin — an admin sets up the link, which is an address, and
 * that is a different thing from reading what is in the calendar.
 */
const calendarService = require('./calendar.service')
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

function dateOf(value, fallback){
    const ms = Number(value)
    return Number.isFinite(ms)?new Date(ms):fallback
}

module.exports = {
    /** Your own window. The calendar page asks for exactly what it draws. */
    events: handler(async (req, user) => {
        const now = Date.now()
        const from = dateOf((req.query || {}).from, new Date(now - 7 * 86400000))
        const to = dateOf((req.query || {}).to, new Date(now + 30 * 86400000))
        return {events: await calendarService.eventsFor(user._id, from, to)}
    }, 'Could not read the calendar'),

    /** Whether it is set up at all, and how the last attempt went. */
    status: handler(async (req, user) => ({
        isConfigured: calendarService.isConfigured(),
        link: await calendarService.linkOf(user._id)
    }), 'Could not read the calendar status'),

    /** All links — the admin screen. Addresses and sync state, no events. */
    links: handler(async () => ({
        isConfigured: calendarService.isConfigured(),
        links: await calendarService.allLinks()
    }), 'Could not read the links'),

    setLink: handler(async req => await calendarService.setLink(req.params.userId, req.body || {}),
        'Could not save the link'),

    removeLink: handler(async req => {
        await calendarService.removeLink(req.params.userId)
        return {ok: true}
    }, 'Could not remove the link'),

    /**
     * Fetch now.
     *
     * Anybody may do it for themselves — waiting a quarter of an hour to see
     * whether a fix worked is how people conclude that a feature is broken.
     * An admin may do it for anybody, which is the same button on the admin
     * screen.
     */
    sync: handler(async (req, user) => {
        const target = req.params.userId || String(user._id)
        if(String(target) !== String(user._id) && !user.isAdmin){
            const err = new Error('Not Authorized')
            err.status = 403
            throw err
        }
        return await calendarService.syncUser(target)
    }, 'Could not synchronise')
}
