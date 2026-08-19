/**
 * Keeping a copy of somebody's Google calendar.
 *
 * The rules that matter are about what this must never do:
 *
 *   - It never writes to Google. The scope asked for cannot, and nothing here
 *     tries. What comes back is a mirror, and a mirror is not an argument
 *     about who is right — Google is.
 *   - It never lets one person read another's events. The link is set up by an
 *     admin, but the events are read by their owner and nobody else. Fifteen
 *     colleagues seeing each other's dentist appointments was not the request.
 *   - It never lets a failed sync take a request down with it. A calendar
 *     that could not be reached shows the last copy and an explanation, which
 *     is what somebody can act on; an error page is not.
 *
 * The window is fixed rather than "everything": a week that was three years
 * ago cannot change any more, and a meeting in 2031 is not worth the storage.
 */
const linkRepo = require('./calendar-link.repo')
const google = require('../../services/google-calendar.service')
const logger = require('../../services/logger.service')

/** How far back and forward the mirror reaches. */
const WINDOW_BACK_DAYS = 14
const WINDOW_AHEAD_DAYS = 90

const DAY = 86400000
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function fail(status, message){
    const err = new Error(message)
    err.status = status
    return err
}

function windowNow(){
    const now = Date.now()
    return {from: new Date(now - WINDOW_BACK_DAYS * DAY), to: new Date(now + WINDOW_AHEAD_DAYS * DAY)}
}

/* ---------------------------------------------------------------- link -- */

async function linkOf(userId){
    return await linkRepo.findLink(userId)
}

async function allLinks(){
    return await linkRepo.allLinks()
}

async function setLink(userId, {externalEmail, isEnabled = true}){
    const email = String(externalEmail || '').trim().toLowerCase()
    if(!EMAIL.test(email)) throw fail(400, 'That does not look like an address')
    if(!google.isConfigured()) throw fail(503, 'Google is not configured on this server')
    return await linkRepo.saveLink(userId, {externalEmail: email, isEnabled: Boolean(isEnabled)})
}

async function removeLink(userId){
    await linkRepo.removeLink(userId)
}

/* ---------------------------------------------------------------- read -- */

async function eventsFor(userId, from, to){
    return await linkRepo.findEvents(userId, from, to)
}

/* ---------------------------------------------------------------- sync -- */

/**
 * Fetch one person's window and replace the copy of it.
 *
 * Errors are recorded on the link and returned, not thrown: this is called
 * both by a person pressing a button and by a timer nobody is watching, and
 * the timer must carry on to the next person.
 */
async function syncUser(userId){
    const link = await linkRepo.findLink(userId)
    if(!link) return {ok: false, error: 'No calendar is linked'}
    if(!link.isEnabled) return {ok: false, error: 'The link is switched off'}
    if(!google.isConfigured()) return {ok: false, error: 'Google is not configured on this server'}

    const {from, to} = windowNow()
    try {
        const raw = await google.fetchEvents(link.externalEmail, from, to)
        const events = raw.map(google.normalise).filter(Boolean).filter(e => !e.isCancelled)
        const written = await linkRepo.replaceWindow(userId, from, to, events)
        await linkRepo.noteSync(userId, {error: null})
        return {ok: true, count: written}
    } catch(err) {
        logger.error(`google sync failed for ${link.externalEmail}`, err)
        await linkRepo.noteSync(userId, {error: err.message})
        return {ok: false, error: err.message}
    }
}

/** Everybody who has a link switched on. Used by the timer. */
async function syncAll(){
    const links = await linkRepo.allLinks({onlyEnabled: true})
    const results = []
    for(const link of links){
        // Deliberately one after another: fifteen calendars are not worth
        // hitting a rate limit for, and a queue of one is easy to reason about.
        results.push({userId: link.userId, ...(await syncUser(link.userId))})
    }
    return results
}

/**
 * The timer.
 *
 * Started from server.js, and only there — a module that starts a timer when
 * it is required is a module the tests cannot import. `unref` so the interval
 * never keeps the process alive on its own.
 */
let timer = null

function startSyncTimer(minutes){
    if(timer) return
    const every = Number(minutes)
    if(!Number.isFinite(every) || every <= 0) return
    if(!google.isConfigured()) return

    const run = () => {
        syncAll().catch(err => logger.error('the calendar sync failed', err))
    }
    timer = setInterval(run, every * 60 * 1000)
    if(timer.unref) timer.unref()
    // The first run is not delayed by a whole interval, but it does wait a
    // moment: the server has just started and has better things to do than
    // fifteen HTTPS handshakes.
    setTimeout(run, 20 * 1000).unref?.()
    logger.info(`calendar sync every ${every} minute(s)`)
}

module.exports = {
    linkOf, allLinks, setLink, removeLink,
    eventsFor, syncUser, syncAll, startSyncTimer,
    isConfigured: google.isConfigured,
    WINDOW_BACK_DAYS, WINDOW_AHEAD_DAYS
}
