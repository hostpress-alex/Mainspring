/**
 * Who is asking, and what they may.
 *
 * Two reads, and they answer different questions. The cookie carries a random
 * token that means nothing by itself — the SESSION table says whose it is, and
 * the USER row says what that person may do. Neither can be produced by
 * knowing a key, which is what the encrypted cookie before this could not say.
 *
 * The account lookup and its ten-second cache live in
 * services/account.service.js, because the socket layer needs the same answer.
 * The session lookup is one indexed read and is not cached: it is the thing
 * that has to stop working the moment somebody signs out from another device.
 */
const {currentUser} = require('../services/account.service')
const authService = require('../api/auth/auth.service')
const apiTokenRepo = require('../services/api-token.repo')
const logger = require('../services/logger.service')
const config = require('../config')
const asyncLocalStorage = require('../services/als.service')

/**
 * Two ways in, one person out.
 *
 * A browser sends the session cookie; a script sends `Authorization: Bearer`.
 * Both end in the same place — a row from the USER table — and everything
 * downstream is written against that and nothing else. That is the whole
 * design: no route, no board role and no service knows or cares which door the
 * caller came through, so a token can never be allowed somewhere a person is
 * not. What a token may do is decided by which boards its account is a member
 * of, in the same members list everybody can see.
 *
 * The bearer is tried FIRST. A script running in a browser extension may carry
 * both, and the explicit header is the one it meant.
 */
async function requireAuth(req, res, next){
    const store = asyncLocalStorage.getStore()

    if(config.isGuestMode && !store.sessionToken && !store.apiToken){
        req.loggedinUser = {_id: '', fullname: 'Guest'}
        return next()
    }
    if(store.apiToken) return await withApiToken(req, res, next, store)
    if(!store.sessionToken) return res.status(401).send('Not Authenticated')

    let session
    let user
    try {
        session = await authService.resolveSession(store.sessionToken)
        // No session, or one that has expired, or one somebody signed out of
        // from another device. All the same answer — the reply must not say
        // which.
        if(session) user = await currentUser(session.userId)
    } catch(err) {
        logger.error('cannot check who is asking', err)
        return res.status(503).send({err: 'Anmeldung kann gerade nicht geprueft werden'})
    }

    if(!session || !user){
        res.clearCookie('loginToken')
        return res.status(401).send('Not Authenticated')
    }

    // The session says who, the account says what they may.
    store.loggedinUser = user
    store.sessionId = session.id
    req.loggedinUser = user
    next()
}

/**
 * A caller holding a token.
 *
 * Unknown, revoked and expired are one answer — 401 and nothing else. Saying
 * "that key is revoked" confirms the key to somebody who only guessed it.
 *
 * No cookie is cleared here: the caller has none, and clearing one would be a
 * `Set-Cookie` on an API answer that no script has any use for.
 */
async function withApiToken(req, res, next, store){
    let entry
    let user
    try {
        entry = await apiTokenRepo.find(store.apiToken)
        if(entry) user = await currentUser(entry.userId)
    } catch(err) {
        logger.error('cannot check an api token', err)
        return res.status(503).send({err: 'Anmeldung kann gerade nicht geprueft werden'})
    }

    if(!entry || !user){
        logger.warn(`api token refused from ${req.ip}`)
        return res.status(401).send({err: 'Not Authenticated'})
    }

    // Fire and forget, like the session touch: recording that a key is in use
    // must not make the request wait, and a lost write only means the "last
    // used" reads a few minutes old.
    Promise.resolve(apiTokenRepo.touch(entry)).catch(err =>
        logger.error('cannot record the token use', err))

    store.loggedinUser = user
    store.apiTokenId = entry.id
    req.loggedinUser = user
    next()
}

/**
 * A door a token may not come through.
 *
 * Some things must stay with a person at a keyboard, and they are the ones
 * that would let a stolen key keep itself alive: minting another token,
 * changing the account's password or e-mail, adding or removing users. A key
 * that can mint keys cannot be revoked — you take one away and the two it
 * made are still there.
 *
 * So these routes want a session. The refusal is 403 and says why: unlike a
 * wrong key, this is not a secret, and a script author staring at a silent 401
 * would go looking for the wrong problem.
 */
function requireSession(req, res, next){
    const store = asyncLocalStorage.getStore()
    if(store && store.apiTokenId){
        logger.warn(`api token attempted a session-only route: ${req.originalUrl}`)
        return res.status(403).send({err: 'Dieser Weg ist fuer API-Tokens gesperrt'})
    }
    next()
}

function requireAdmin(req, res, next){
    const {loggedinUser} = asyncLocalStorage.getStore()
    if(!loggedinUser) return res.status(401).send('Not Authenticated')
    if(!loggedinUser.isAdmin){
        logger.warn(`${loggedinUser.fullname} attempted to perform an admin action`)
        res.status(403).end('Not Authorized')
        return
    }
    next()
}

module.exports = {
    requireAuth,
    requireAdmin,
    requireSession
}
