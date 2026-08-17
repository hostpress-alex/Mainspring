/**
 * Who somebody is right now, rather than who their cookie says they were.
 *
 * The login cookie is the user record, encrypted: it carries `_id`, `fullname`
 * and `isAdmin`. That is fine as proof of identity and wrong as a source of
 * rights — an account switched off, or an admin flag taken away, only reached
 * the application when the person next signed in.
 *
 * So: the cookie says WHO, this says WHAT THEY MAY.
 *
 * Cached for ten seconds, which is the honest wording of the guarantee.
 * Closing an account takes effect within ten seconds — not instantly, and not
 * "whenever they next close their browser", which is what it was. A lookup per
 * request would be a query per stylesheet.
 */
const userService = require('../api/user/user.service')

const FRESH_MS = 10 * 1000

const cache = new Map()

/**
 * The account behind an id, or null when there is none or it is switched off.
 *
 * A failed lookup is not cached and not swallowed: a database that is briefly
 * away would otherwise log everybody out for ten seconds. The caller turns the
 * error into "cannot check right now", which is a different answer from "you
 * are not who you say you are".
 */
async function currentUser(userId){
    const id = String(userId || '')
    if(!id) return null

    const hit = cache.get(id)
    if(hit && (Date.now() - hit.at) < FRESH_MS) return hit.user

    const user = await userService.getById(id)
    const usable = (user && user.state !== 'inactive')?user:null
    cache.set(id, {at: Date.now(), user: usable})
    return usable
}

/**
 * Was this token signed before the account drew a line under everything?
 *
 * "Sign out everywhere" and a password change both write that line. A token
 * older than it is refused — that is the whole revocation, because there is no
 * session table to empty.
 *
 * A missing `iat` counts as revoked whenever a line exists: those are the
 * tokens from before the age check, and they are the ones this was written
 * against.
 */
function isRevoked(user, iat){
    const validFrom = Number((user && user.sessionsValidFrom) || 0)
    if(!validFrom) return false
    return Number(iat || 0) < validFrom
}

/** Called when an account changes, so nobody has to wait the ten seconds out. */
function forget(userId){
    cache.delete(String(userId || ''))
}

module.exports = {currentUser, forget, isRevoked, FRESH_MS}
