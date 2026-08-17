/**
 * Who is asking, checked against the database rather than the cookie.
 *
 * The login cookie IS the user record, encrypted — it carries `_id`,
 * `fullname` and `isAdmin`, and nothing used to look any further. That made
 * two promises the application does not keep:
 *
 *   - an account switched off went on working until the browser was closed,
 *     because the cookie still said it existed
 *   - somebody who had their admin rights taken away kept them just as long,
 *     because `isAdmin` was in the cookie too
 *
 * So the cookie now says WHO, and the database says WHAT THEY MAY. The cookie
 * is still what proves the identity; it just no longer carries the rights.
 *
 * The lookup and its ten-second cache live in services/account.service.js,
 * because the socket layer needs the same answer.
 *
 * This is deliberately in `requireAuth` and not in the ALS middleware: this
 * one runs on the API routes only, and a request for a stylesheet has no
 * business asking the database who is holding it.
 */
const {currentUser, isRevoked} = require('../services/account.service')
const logger = require('../services/logger.service')
const config = require('../config')
const asyncLocalStorage = require('../services/als.service')

async function requireAuth(req, res, next){
    const store = asyncLocalStorage.getStore()
    const fromCookie = store && store.loggedinUser

    if(config.isGuestMode && !fromCookie){
        req.loggedinUser = {_id: '', fullname: 'Guest'}
        return next()
    }
    if(!fromCookie) return res.status(401).send('Not Authenticated')

    let user
    try {
        user = await currentUser(fromCookie._id)
    } catch(err) {
        logger.error('cannot check who is asking', err)
        return res.status(503).send({err: 'Anmeldung kann gerade nicht geprueft werden'})
    }

    if(!user){
        // The account is gone or switched off. The cookie is still valid and
        // now means nothing — taking it away here saves the next request.
        res.clearCookie('loginToken')
        return res.status(401).send('Not Authenticated')
    }

    // Signed out everywhere, or the password was changed. There is no session
    // table to empty — a token older than the line the account drew is simply
    // not accepted any more.
    if(isRevoked(user, fromCookie.iat)){
        res.clearCookie('loginToken')
        return res.status(401).send('Not Authenticated')
    }

    // Everything downstream reads this. The rights come from the row, the
    // identity from the cookie.
    store.loggedinUser = {...fromCookie, ...user}
    req.loggedinUser = store.loggedinUser
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
