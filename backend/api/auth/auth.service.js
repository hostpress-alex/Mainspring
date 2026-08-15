/**
 * Passwords and the login cookie.
 *
 * The cookie is not a random session id looked up in a table, it is the user
 * record itself, encrypted. Whoever knows the key can mint a cookie for any
 * account, admin included, without ever touching the database. So the key is
 * the whole of the security here.
 *
 * It used to have a hardcoded fallback, which meant every checkout of this
 * repository shared one key. It does not any more: in production a missing
 * SECRET1 stops the server (see server.js), and in development the fallback
 * is named so that nobody mistakes it for a secret.
 *
 * Generate one with:  openssl rand -hex 32
 */
const Cryptr = require('cryptr')
const bcrypt = require('bcrypt')
const userService = require('../user/user.service')
const logger = require('../../services/logger.service')
const config = require('../../config')

const SALT_ROUNDS = 10

/** Obvious on sight, and it never leaves a developer machine. */
const DEV_SECRET = 'insecure-development-key-do-not-use-in-production'

let cryptrInstance = null
let warnedAboutDevSecret = false

/**
 * Built on first use rather than at import time, so that a tool which only
 * wants userService does not fall over on a missing key.
 */
function cryptr() {
    if (cryptrInstance) return cryptrInstance

    let secret = config.sessionSecret
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            // server.js catches this at start-up. Reaching here means someone
            // bypassed it, and carrying on would be worse than crashing.
            throw new Error('SECRET1 is not set')
        }
        secret = DEV_SECRET
        if (!warnedAboutDevSecret) {
            warnedAboutDevSecret = true
            logger.warn('SECRET1 is not set, using the development key. Never do this on a reachable server.')
        }
    }

    cryptrInstance = new Cryptr(secret)
    return cryptrInstance
}

/**
 * A hash to compare against when the username does not exist.
 *
 * Without it, an unknown username answers immediately while a known one waits
 * for bcrypt, and that difference is measurable from outside. It turns the
 * login form into a way of asking "does this account exist?".
 */
const DUMMY_HASH = bcrypt.hashSync('there-is-no-user-with-this-name', SALT_ROUNDS)

async function login(username, password) {
    logger.debug(`auth.service - login with username: ${username}`)
    const user = await userService.getByUsername(username)

    // Same amount of work either way, and the same message either way.
    const match = await bcrypt.compare(password || '', (user && user.password) || DUMMY_HASH)
    if (!user || !match) return Promise.reject('Invalid username or password')

    delete user.password
    user._id = user._id.toString()
    return user
}

async function signup({ username, password, fullname, imgUrl }) {
    logger.debug(`auth.service - signup with username: ${username}, fullname: ${fullname}`)
    if (!username || !password || !fullname) return Promise.reject('Missing required signup information')

    const userExist = await userService.getByUsername(username)
    if (userExist) return Promise.reject('Username already taken')

    const hash = await bcrypt.hash(password, SALT_ROUNDS)
    return userService.add({ username, password: hash, fullname, imgUrl, isAdmin: false })
}

function getLoginToken(user) {
    const userInfo = { _id: user._id, fullname: user.fullname, isAdmin: user.isAdmin }
    return cryptr().encrypt(JSON.stringify(userInfo))
}

function validateToken(loginToken) {
    try {
        return JSON.parse(cryptr().decrypt(loginToken))
    } catch (err) {
        // An expired or tampered cookie is normal traffic, not an incident.
        // It used to print on every single request carrying a stale cookie.
        logger.debug('Invalid login token')
        return null
    }
}

module.exports = {
    signup,
    login,
    getLoginToken,
    validateToken,
}
