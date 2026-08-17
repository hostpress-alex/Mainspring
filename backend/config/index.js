/**
 * Credentials and switches.
 *
 * Values come from environment variables. If a .env file sits in the backend
 * folder it is read in as well, which is convenient during development. If
 * the dotenv package is missing everything still runs, and only the real
 * environment variables count.
 */
try {
    require('dotenv').config({path: require('path').resolve(__dirname, '..', '.env'), quiet: true})
} catch(err) {
    // dotenv is optional.
}

var config

if(process.env.NODE_ENV === 'production'){
    config = require('./prod')
} else {
    config = require('./dev')
}

// Guest mode disables authentication entirely — for the REST API and for the
// socket. Turn it on for debugging only:
//   GUEST_MODE=true npm start
config.isGuestMode = process.env.GUEST_MODE === 'true'

// Public sign-up. On a reachable server set ALLOW_SIGNUP=false, otherwise
// anyone can create an account for themselves and see every board.
config.allowSignup = process.env.ALLOW_SIGNUP !== 'false'

// The key the login cookie is encrypted with. There is deliberately no shared
// default: the cookie *is* the user record, so whoever knows the key can mint
// one for any account without touching the database. In production a missing
// value stops the server (server.js); in development auth.service falls back
// to a key that is named after what it is.
//
//   openssl rand -hex 32
// Unused since sessions became rows. Kept for one release so that an
// environment still setting SECRET1 does not look broken; nothing reads it.
config.sessionSecret = process.env.SECRET1 || null

// Set to true when the server sits behind a reverse proxy, so that Express
// reads the client address from X-Forwarded-For. Without it every request
// appears to come from the proxy, and the login rate limit counts the whole
// world as one visitor.
config.trustProxy = process.env.TRUST_PROXY === 'true'

module.exports = config
