const {createLimiter} = require('../services/rate-limit.service')
const apiTokenRepo = require('../services/api-token.repo')
const logger = require('../services/logger.service')
const asyncLocalStorage = require('../services/als.service')

/**
 * The ceiling that applies to callers holding a token.
 *
 * A browser is not counted here. A person cannot click fast enough to matter,
 * and counting them would mean one wrong number turns the application slow for
 * the team instead of loud for the script — the failure this is supposed to
 * prevent, arriving through the door it was supposed to guard.
 *
 * Per token, not per address: several scripts behind one office NAT are
 * several callers, and one script that moves to another machine is still one.
 * A caller with no token that somehow reaches here is counted by address, so
 * the fallback is never "unlimited".
 */

/** Generous on purpose. This is a backstop against a loop, not a quota — a
 *  limit low enough to shape somebody's integration would be a limit they
 *  work around by running two. */
const LIMIT = 600
const WINDOW_MS = 60 * 1000

const limiter = createLimiter({limit: LIMIT, windowMs: WINDOW_MS})

function apiRateLimit(req, res, next){
    const store = asyncLocalStorage.getStore()
    if(!store || !store.apiToken) return next()

    // The hash, never the token itself. This map outlives the request, and a
    // long-lived structure holding pieces of live keys is the kind of thing
    // that turns a heap dump into an incident. It is the same hash the table
    // is keyed by, so a refused caller and its row line up in the log.
    //
    // This runs BEFORE requireAuth, on purpose: a wrong key must be counted
    // too, or the limit is a limit on valid callers only and guessing is free.
    const key = apiTokenRepo.keyOf(store.apiToken)
    const verdict = limiter.take(key)

    res.set('X-RateLimit-Limit', String(LIMIT))
    res.set('X-RateLimit-Remaining', String(verdict.remaining))

    if(verdict.ok) return next()

    const seconds = Math.ceil(verdict.retryAfterMs / 1000)
    res.set('Retry-After', String(seconds))
    logger.warn(`api token over the rate limit: ${req.method} ${req.originalUrl}`)
    // 429 and a Retry-After, because the caller is a program: it can act on
    // this, where it can do nothing with a sentence.
    res.status(429).send({err: 'Zu viele Anfragen', retryAfterSeconds: seconds})
}

module.exports = {apiRateLimit, limiter, LIMIT, WINDOW_MS}
