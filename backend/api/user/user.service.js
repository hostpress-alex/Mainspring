/**
 * Business rules around users.
 *
 * Database access goes through user.repo and nowhere else, so this file never
 * has to know what a row looks like.
 */
const logger = require('../../services/logger.service')
const userRepo = require('./user.repo')
const bcrypt = require('bcrypt')

const SALT_ROUNDS = 10

function httpError(status, msg){
    const err = new Error(msg)
    err.status = status
    return err
}

/** Das Passwort verlaesst diese Schicht nie. */
function withoutPassword(user){
    if(!user) return user
    const copy = {...user}
    delete copy.password
    return copy
}

module.exports = {
    query,
    setState,
    logoutEverywhere,
    sessions,
    endSession,
    getById,
    getByUsername,
    remove,
    update,
    add,
    create
}

async function query(filterBy = {}){
    try {
        const users = await userRepo.query(filterBy)
        return users.map(withoutPassword)
    } catch(err) {
        logger.error('cannot find users', err)
        throw err
    }
}

async function getById(userId){
    try {
        return withoutPassword(await userRepo.findById(userId))
    } catch(err) {
        logger.error(`while finding user by id: ${userId}`, err)
        throw err
    }
}

/** With the password — the login needs it. */
async function getByUsername(username){
    try {
        return await userRepo.findByUsername(username)
    } catch(err) {
        logger.error(`while finding user by username: ${username}`, err)
        throw err
    }
}

/**
 * Close an account. Nothing is deleted.
 *
 * Every table that records who did something points at this row and none of
 * them has a foreign key onto it — deleting the row would leave the whole
 * history pointing at nothing. So the account is switched off: no login, out
 * of every picker, and their name still under everything they wrote.
 *
 * Switching it back on is the same call with 'active'.
 */
async function remove(userId, requester){
    return await setState(userId, 'inactive', requester)
}

/**
 * The devices this account is signed in on.
 *
 * Only ever your own, or an administrator asking about somebody else. The
 * token is not in the answer and cannot be — the table holds its hash.
 */
async function sessions(userId, requester, currentId = null){
    const existing = await userRepo.findById(userId)
    if(!existing) throw httpError(404, 'User not found')
    _requireSelfOrAdmin(userId, requester)

    const rows = await require('../../services/session.repo').findForUser(userId)
    return rows.map(row => ({
        id: row.id,
        createdAt: row.createdAt,
        lastSeenAt: row.lastSeenAt,
        userAgent: row.userAgent,
        ip: row.ip,
        // So the interface can say "this one" rather than asking somebody to
        // work out which line is the browser they are reading it in.
        isCurrent: Boolean(currentId) && row.id === currentId
    }))
}

/** End one session — one device, not all of them. */
async function endSession(userId, sessionId, requester){
    const existing = await userRepo.findById(userId)
    if(!existing) throw httpError(404, 'User not found')
    _requireSelfOrAdmin(userId, requester)

    const repo = require('../../services/session.repo')
    // Checked against the owner rather than deleted by id: an id from
    // somewhere else must not end somebody else's session.
    const mine = await repo.findForUser(userId)
    if(!mine.some(s => s.id === sessionId)) throw httpError(404, 'Sitzung nicht gefunden')

    await repo.remove(sessionId)
    return {ok: true}
}

function _requireSelfOrAdmin(userId, requester){
    const isSelf = requester && String(requester._id) === String(userId)
    const isAdmin = requester && requester.isAdmin === true
    if(!isSelf && !isAdmin) throw httpError(403, 'Kein Zugriff auf diesen Benutzer')
}

/**
 * Sign somebody out of everywhere, this browser included.
 *
 * Self or an administrator — the same rule as changing the profile. There is
 * no list of sessions to show, because there are none: the cookie IS the
 * session, so the only honest control is "none of the old ones count any
 * more".
 */
async function logoutEverywhere(userId, requester){
    const existing = await userRepo.findById(userId)
    if(!existing) throw httpError(404, 'User not found')

    _requireSelfOrAdmin(userId, requester)

    await revokeSessions(userId)
    return {ok: true}
}

/**
 * End every session of this account.
 *
 * A DELETE, not a date to compare against. That was the shape of this while
 * there was nothing to delete; there is now, and a row that is gone cannot be
 * argued with.
 */
async function revokeSessions(userId){
    // Lazily required: all three read this file — see setState.
    await require('../../services/session.repo').removeAllForUser(userId)
    require('../../services/account.service').forget(userId)
    require('../../services/socket.service').disconnectUser(userId)
}

async function setState(userId, state, requester){
    try {
        if(state !== 'active' && state !== 'inactive') throw httpError(400, 'Unbekannter Zustand')
        const existing = await userRepo.findById(userId)
        if(!existing) throw httpError(404, 'User not found')

        if(!requester || requester.isAdmin !== true) throw httpError(403, 'Nur Admins')
        if(state === 'inactive' && String(requester._id) === String(userId)){
            throw httpError(400, 'Du kannst dein eigenes Konto nicht deaktivieren')
        }

        await userRepo.setState(userId, state)

        // Lazily required: account.service reads this file, and a plain
        // require at the top would be a circle.
        require('../../services/account.service').forget(userId)
        if(state === 'inactive'){
            // Their open tabs sit in board rooms and would go on being fed.
            require('../../services/socket.service').disconnectUser(userId)
        }
        return withoutPassword(await userRepo.findById(userId))
    } catch(err) {
        if(!err.status) logger.error(`cannot change the state of user ${userId}`, err)
        throw err
    }
}

async function update(user, requester){
    try {
        const existing = await userRepo.findById(user._id)
        if(!existing) throw httpError(404, 'User not found')

        const isSelf = requester && String(requester._id) === String(user._id)
        const isAdmin = requester && requester.isAdmin === true
        if(!isSelf && !isAdmin) throw httpError(403, 'Kein Zugriff auf diesen Benutzer')

        // Allow-list. Everything else in the request body is ignored.
        const userToSave = {}
        let changesPassword = false
        if(typeof user.fullname === 'string') userToSave.fullname = user.fullname
        if(typeof user.username === 'string' && user.username !== existing.username){
            const taken = await userRepo.findByUsername(user.username)
            if(taken) throw httpError(409, 'Benutzername bereits vergeben')
            userToSave.username = user.username
        }
        // Profile picture: only a path into our own upload layer. External URLs
        // are refused so that no images get pulled in from foreign servers. Older
        // data URLs stay readable but are never written again.
        if(typeof user.imgUrl === 'string'){
            if(user.imgUrl && !/^\/api\/upload\/[a-f0-9]{32}$/.test(user.imgUrl)){
                throw httpError(400, 'Profilbild muss ueber den Upload dieser Anwendung kommen')
            }
            userToSave.imgUrl = user.imgUrl
        }

        // Interface language. Checked for shape, not against a list of the
        // languages that exist: the list of languages IS the set of files in
        // frontend/src/i18n, and a second copy of it here would be a second
        // place to forget. An unknown code is harmless — the frontend falls
        // back to English for anything it cannot load. '' means "not chosen".
        if(typeof user.language === 'string'){
            const code = user.language.trim()
            if(code && !/^[a-z]{2}(-[A-Z]{2})?$/.test(code)) throw httpError(400, 'Not a language code')
            userToSave.language = code
        }

        // Passwords are ALWAYS hashed. The plain text used to land in the DB.
        if(user.password){
            if(String(user.password).length < 8) throw httpError(400, 'Passwort muss mindestens 8 Zeichen haben')
            // Changing one's own password requires knowing the old one. Admins
            // may reset somebody else's password without it.
            if(isSelf){
                if(!user.currentPassword) throw httpError(400, 'Bitte aktuelles Passwort angeben')
                const ok = await bcrypt.compare(String(user.currentPassword), existing.password || '')
                if(!ok) throw httpError(403, 'Aktuelles Passwort ist falsch')
            }
            userToSave.password = await bcrypt.hash(user.password, SALT_ROUNDS)
            // Everything signed in with the old password stops working. A
            // password changed because somebody else knew it is worth little
            // while their tab is still open — and that includes the session
            // making this very request, which is why the profile page signs
            // out straight afterwards.
            changesPassword = true
        }
        // Only admins may set the admin flag, and nobody may demote themselves.
        if(typeof user.isAdmin === 'boolean' && isAdmin){
            if(isSelf && user.isAdmin === false) throw httpError(400, 'Du kannst dir selbst nicht die Admin-Rechte entziehen')
            userToSave.isAdmin = user.isAdmin
        }

        await userRepo.updateFields(existing._id, userToSave)
        if(changesPassword) await revokeSessions(existing._id)
        return withoutPassword(await userRepo.findById(existing._id))
    } catch(err) {
        if(!err.status) logger.error(`cannot update user ${user._id}`, err)
        throw err
    }
}

/** A user created by an admin. The password is hashed here. */
async function create({username, password, fullname, imgUrl, isAdmin}){
    try {
        if(!username || !password || !fullname) throw httpError(400, 'username, password und fullname sind Pflicht')
        if(String(password).length < 8) throw httpError(400, 'Passwort muss mindestens 8 Zeichen haben')
        if(await userRepo.findByUsername(username)) throw httpError(409, 'Benutzername bereits vergeben')

        const saved = await userRepo.insert({
            username,
            password: await bcrypt.hash(password, SALT_ROUNDS),
            fullname,
            imgUrl: imgUrl || '',
            isAdmin: isAdmin === true
        })
        return withoutPassword(saved)
    } catch(err) {
        if(!err.status) logger.error('cannot create user', err)
        throw err
    }
}

/** Sign-up. The password arrives already hashed (auth.service). */
async function add(user){
    try {
        const saved = await userRepo.insert({
            username: user.username,
            password: user.password,
            fullname: user.fullname,
            imgUrl: user.imgUrl || '',
            isAdmin: user.isAdmin === true
        })
        return withoutPassword(saved)
    } catch(err) {
        logger.error('cannot add user', err)
        throw err
    }
}
