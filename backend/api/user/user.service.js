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

/** Mit Passwort — wird fuer die Anmeldung gebraucht. */
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

    const isSelf = requester && String(requester._id) === String(userId)
    const isAdmin = requester && requester.isAdmin === true
    if(!isSelf && !isAdmin) throw httpError(403, 'Kein Zugriff auf diesen Benutzer')

    await revokeSessions(userId)
    return {ok: true}
}

/** The line itself, plus everything that has to hear about it at once. */
async function revokeSessions(userId){
    await userRepo.setSessionsValidFrom(userId, Date.now())
    // Lazily required: both of these read this file — see setState.
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

        // Whitelist. Alles andere aus dem Request-Body wird ignoriert.
        const userToSave = {}
        let changesPassword = false
        if(typeof user.fullname === 'string') userToSave.fullname = user.fullname
        if(typeof user.username === 'string' && user.username !== existing.username){
            const taken = await userRepo.findByUsername(user.username)
            if(taken) throw httpError(409, 'Benutzername bereits vergeben')
            userToSave.username = user.username
        }
        // Profilbild: nur ein Pfad auf die eigene Upload-Schicht. Externe URLs
        // werden abgewiesen, damit keine Bilder von fremden Servern eingebunden
        // werden. Altbestand als Data-URL bleibt lesbar, wird aber nicht neu gesetzt.
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

        // Passwoerter werden IMMER gehasht. Vorher landete der Klartext in der DB.
        if(user.password){
            if(String(user.password).length < 8) throw httpError(400, 'Passwort muss mindestens 8 Zeichen haben')
            // Wer sein eigenes Passwort aendert, muss das alte kennen. Admins duerfen
            // fremde Passwoerter ohne das alte zuruecksetzen.
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
        // Nur Admins duerfen das Admin-Flag setzen, und niemand sich selbst degradieren.
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

/** Vom Admin angelegter Benutzer. Passwort wird hier gehasht. */
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

/** Registrierung. Das Passwort ist hier bereits gehasht (auth.service). */
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
