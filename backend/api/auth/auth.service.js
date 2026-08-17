/**
 * Passwords, and starting a session.
 *
 * There is no signing key here any more, and that is the point of this file.
 *
 * The login cookie used to BE the user record, encrypted with SECRET1 —
 * whoever knew that key could write `{_id: "<an admin's id>"}`, encrypt it,
 * and be that admin. Guards were added around it (an age, a revocation date,
 * rights read from the database rather than the token), and every one of them
 * is a condition ON that credential. None of them helps against somebody who
 * can issue new ones.
 *
 * The cookie now carries 32 random bytes that mean nothing by themselves. The
 * session is a row in the database (services/session.repo.js). Nothing can be
 * derived, so nothing can be forged: SECRET1 no longer grants anything.
 */
const bcrypt = require('bcrypt')
const userService = require('../user/user.service')
const sessionRepo = require('../../services/session.repo')
const logger = require('../../services/logger.service')

const SALT_ROUNDS = 10

/**
 * A hash to compare against when the username does not exist.
 *
 * Without it, an unknown username answers immediately while a known one waits
 * for bcrypt, and that difference is measurable from outside. It turns the
 * login form into a way of asking "does this account exist?".
 */
const DUMMY_HASH = bcrypt.hashSync('there-is-no-user-with-this-name', SALT_ROUNDS)

async function login(username, password){
    logger.debug(`auth.service - login with username: ${username}`)
    const user = await userService.getByUsername(username)

    // Same amount of work either way, and the same message either way.
    const match = await bcrypt.compare(password || '', (user && user.password) || DUMMY_HASH)
    if(!user || !match) return Promise.reject('Invalid username or password')
    // A closed account is not a wrong password, and it is told apart from one
    // nowhere the client can see: the same message, after the same amount of
    // work, so the login form cannot be used to ask which accounts still
    // exist.
    if(user.state === 'inactive') return Promise.reject('Invalid username or password')

    delete user.password
    user._id = user._id.toString()
    return user
}

async function signup({username, password, fullname, imgUrl}){
    logger.debug(`auth.service - signup with username: ${username}, fullname: ${fullname}`)
    if(!username || !password || !fullname) return Promise.reject('Missing required signup information')

    const userExist = await userService.getByUsername(username)
    if(userExist) return Promise.reject('Username already taken')

    const hash = await bcrypt.hash(password, SALT_ROUNDS)
    return userService.add({username, password: hash, fullname, imgUrl, isAdmin: false})
}

/**
 * How long a token is accepted, however carefully it is kept.
 *
 * The cookie itself has no `maxAge`, so a browser drops it when it closes —
 * but the VALUE carried no time at all, and a copy of it worked forever. This
 * is the ceiling on that: thirty days from the moment it was issued, whoever
 * is holding it.
 *
 * Not a substitute for revocation. That is `sessions_valid_from` on the user,
 * checked in requireAuth — this is the backstop for the tokens nobody knows
 * about.
 */
const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Start a session for somebody who has proved who they are.
 *
 * Returns the raw token, which is the one moment it exists outside the
 * browser: the table holds its hash.
 */
async function startSession(user, {userAgent = '', ip = ''} = {}){
    const {token} = await sessionRepo.create(user._id, {userAgent, ip})
    return token
}

/**
 * Who is holding this token, or null.
 *
 * Null covers all of: no token, no such session, and one that has expired.
 * They are the same answer on purpose — the reply must not say which.
 */
async function resolveSession(token){
    const session = await sessionRepo.find(token)
    if(!session) return null
    // Fire and forget: pushing the expiry out must not make a request wait,
    // and a lost touch only means the session expires a few minutes earlier.
    Promise.resolve(sessionRepo.touch(session)).catch(err =>
        logger.error('cannot refresh the session', err))
    return session
}

async function endSession(token){
    await sessionRepo.removeByToken(token)
}

module.exports = {
    signup,
    login,
    startSession,
    resolveSession,
    endSession
}
