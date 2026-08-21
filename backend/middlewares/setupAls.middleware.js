/**
 * Put the request into an async context, and nothing else.
 *
 * This runs on EVERY request — stylesheets, images, the single page
 * application itself — so it does no database work. It used to decrypt the
 * cookie into a whole user, which was free because the cookie WAS the user.
 * The cookie is now an opaque token, and turning it into a person is a read;
 * that happens in requireAuth, which only runs on the API.
 */
const asyncLocalStorage = require('../services/als.service')

/**
 * The bearer token, if the caller sent one.
 *
 * Read from the Authorization header and from nowhere else — not from a
 * cookie, not from a query parameter. A key in a query string ends up in the
 * access log of every proxy on the way, in the browser history and in the
 * Referer header of the next request, and a key that has been written down
 * somewhere is not a key any more.
 */
function bearerOf(req){
    const header = req.headers && req.headers.authorization
    if(!header) return null
    const match = /^Bearer[ ]+(.+)$/i.exec(String(header).trim())
    if(!match) return null
    const value = match[1].trim()
    return value || null
}

function setupAsyncLocalStorage(req, res, next){
    asyncLocalStorage.run({}, () => {
        const store = asyncLocalStorage.getStore()
        store.sessionToken = (req.cookies && req.cookies.loginToken) || null
        store.apiToken = bearerOf(req)
        next()
    })
}

module.exports = setupAsyncLocalStorage
module.exports.bearerOf = bearerOf
