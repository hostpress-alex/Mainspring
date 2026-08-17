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
const logger = require('../services/logger.service')
const config = require('../config')
const asyncLocalStorage = require('../services/als.service')

async function requireAuth(req, res, next){
    const store = asyncLocalStorage.getStore()

    if(config.isGuestMode && !store.sessionToken){
        req.loggedinUser = {_id: '', fullname: 'Guest'}
        return next()
    }
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
    requireAdmin
}
