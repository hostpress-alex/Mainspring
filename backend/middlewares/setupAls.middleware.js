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

function setupAsyncLocalStorage(req, res, next){
    asyncLocalStorage.run({}, () => {
        const store = asyncLocalStorage.getStore()
        store.sessionToken = (req.cookies && req.cookies.loginToken) || null
        next()
    })
}

module.exports = setupAsyncLocalStorage
