/**
 * Working hours over HTTP.
 *
 * Reading somebody else's is allowed to anybody signed in — fifteen people in
 * one company who cannot see when a colleague works would have to ask in chat
 * instead, which is the same information with more steps. Writing is yourself
 * or an admin.
 */
const workHoursService = require('./workhours.service')
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

function requireSelfOrAdmin(user, userId){
    if(String(user._id) === String(userId) || user.isAdmin) return
    const err = new Error('Not Authorized')
    err.status = 403
    throw err
}

/**
 * A date from the query string, or nothing.
 *
 * The client sends milliseconds, because the two calendar grids already work
 * in them and a date parsed from text is a date parsed differently in two
 * time zones.
 */
function dateOf(value, fallback){
    const ms = Number(value)
    if(!Number.isFinite(ms)) return fallback
    return new Date(ms)
}

module.exports = {
    mine: handler(async (req, user) => ({days: await workHoursService.forUser(user._id)}),
        'Could not read the working hours'),

    forUser: handler(async req => ({days: await workHoursService.forUser(req.params.userId)}),
        'Could not read the working hours'),

    /** Everybody at once — the admin screen would otherwise ask fifteen times. */
    all: handler(async req => {
        const ids = String((req.query || {}).userIds || '').split(',').map(s => s.trim()).filter(Boolean)
        return {byUser: await workHoursService.forUsers(ids)}
    }, 'Could not read the working hours'),

    save: handler(async (req, user) => {
        requireSelfOrAdmin(user, req.params.userId)
        return {days: await workHoursService.save(req.params.userId, (req.body || {}).days)}
    }, 'Could not save the working hours'),

    /** Only ever your own week: capacity is not a thing to browse about others. */
    summary: handler(async (req, user) => {
        const now = Date.now()
        const from = dateOf((req.query || {}).from, new Date(now))
        const to = dateOf((req.query || {}).to, new Date(now + 7 * 86400000))
        if(to <= from){
            const err = new Error('The end of the window is after its start')
            err.status = 400
            throw err
        }
        return await workHoursService.summary(user._id, from, to)
    }, 'Could not work out the week')
}
