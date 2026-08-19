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

/**
 * Reading Google calendars, if this installation does that at all.
 *
 * Absent means the feature is simply off: no link can be set up, the sync
 * never runs, and the calendar shows what it always showed. Nothing here has
 * a default — a half-configured integration that silently talks to the wrong
 * Google project is worse than one that says it is not set up.
 *
 * A key FILE is the intended way. The private key is a PEM with newlines in
 * it, and an .env file mangles those often enough that the variable form
 * exists mainly for people who already know that and escape them.
 *
 *   GOOGLE_SA_KEY_FILE=/etc/mainspring/google-service-account.json
 * or
 *   GOOGLE_SA_CLIENT_EMAIL=…iam.gserviceaccount.com
 *   GOOGLE_SA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…"
 *
 * Keep the file outside the repository. It is the credential for reading
 * every calendar in the domain.
 */
config.googleKeyFile = process.env.GOOGLE_SA_KEY_FILE || null
config.googleClientEmail = process.env.GOOGLE_SA_CLIENT_EMAIL || null
config.googlePrivateKey = process.env.GOOGLE_SA_PRIVATE_KEY || null

// How often the background sync runs, in minutes. 0 switches it off, which is
// what the tests and any second instance of the server want — two processes
// syncing the same calendars is duplicated work, not faster work.
config.googleSyncMinutes = Number(process.env.GOOGLE_SYNC_MINUTES || 15)

module.exports = config
