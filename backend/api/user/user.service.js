/**
 * Fachlogik rund um Benutzer.
 *
 * Der Zugriff auf die Datenbank laeuft ausschliesslich ueber user.repo —
 * dadurch ist es egal, ob dahinter MongoDB oder MariaDB steckt.
 */
const logger = require('../../services/logger.service')
const userRepo = require('./user.repo')
const bcrypt = require('bcrypt')

const SALT_ROUNDS = 10

function httpError(status, msg) {
    const err = new Error(msg)
    err.status = status
    return err
}

/** Das Passwort verlaesst diese Schicht nie. */
function withoutPassword(user) {
    if (!user) return user
    const copy = { ...user }
    delete copy.password
    return copy
}

module.exports = {
    query,
    getById,
    getByUsername,
    remove,
    update,
    add,
    create,
}

async function query(filterBy = {}) {
    try {
        const users = await userRepo.query(filterBy)
        return users.map(withoutPassword)
    } catch (err) {
        logger.error('cannot find users', err)
        throw err
    }
}

async function getById(userId) {
    try {
        return withoutPassword(await userRepo.findById(userId))
    } catch (err) {
        logger.error(`while finding user by id: ${userId}`, err)
        throw err
    }
}

/** Mit Passwort — wird fuer die Anmeldung gebraucht. */
async function getByUsername(username) {
    try {
        return await userRepo.findByUsername(username)
    } catch (err) {
        logger.error(`while finding user by username: ${username}`, err)
        throw err
    }
}

async function remove(userId) {
    try {
        await userRepo.deleteById(userId)
    } catch (err) {
        logger.error(`cannot remove user ${userId}`, err)
        throw err
    }
}

async function update(user, requester) {
    try {
        const existing = await userRepo.findById(user._id)
        if (!existing) throw httpError(404, 'User not found')

        const isSelf = requester && String(requester._id) === String(user._id)
        const isAdmin = requester && requester.isAdmin === true
        if (!isSelf && !isAdmin) throw httpError(403, 'Kein Zugriff auf diesen Benutzer')

        // Whitelist. Alles andere aus dem Request-Body wird ignoriert.
        const userToSave = {}
        if (typeof user.fullname === 'string') userToSave.fullname = user.fullname
        if (typeof user.username === 'string' && user.username !== existing.username) {
            const taken = await userRepo.findByUsername(user.username)
            if (taken) throw httpError(409, 'Benutzername bereits vergeben')
            userToSave.username = user.username
        }
        // Profilbild: nur ein Pfad auf die eigene Upload-Schicht. Externe URLs
        // werden abgewiesen, damit keine Bilder von fremden Servern eingebunden
        // werden. Altbestand als Data-URL bleibt lesbar, wird aber nicht neu gesetzt.
        if (typeof user.imgUrl === 'string') {
            if (user.imgUrl && !/^\/api\/upload\/[a-f0-9]{32}$/.test(user.imgUrl)) {
                throw httpError(400, 'Profilbild muss ueber den Upload dieser Anwendung kommen')
            }
            userToSave.imgUrl = user.imgUrl
        }

        // Passwoerter werden IMMER gehasht. Vorher landete der Klartext in der DB.
        if (user.password) {
            if (String(user.password).length < 8) throw httpError(400, 'Passwort muss mindestens 8 Zeichen haben')
            // Wer sein eigenes Passwort aendert, muss das alte kennen. Admins duerfen
            // fremde Passwoerter ohne das alte zuruecksetzen.
            if (isSelf) {
                if (!user.currentPassword) throw httpError(400, 'Bitte aktuelles Passwort angeben')
                const ok = await bcrypt.compare(String(user.currentPassword), existing.password || '')
                if (!ok) throw httpError(403, 'Aktuelles Passwort ist falsch')
            }
            userToSave.password = await bcrypt.hash(user.password, SALT_ROUNDS)
        }
        // Nur Admins duerfen das Admin-Flag setzen, und niemand sich selbst degradieren.
        if (typeof user.isAdmin === 'boolean' && isAdmin) {
            if (isSelf && user.isAdmin === false) throw httpError(400, 'Du kannst dir selbst nicht die Admin-Rechte entziehen')
            userToSave.isAdmin = user.isAdmin
        }

        await userRepo.updateFields(existing._id, userToSave)
        return withoutPassword(await userRepo.findById(existing._id))
    } catch (err) {
        if (!err.status) logger.error(`cannot update user ${user._id}`, err)
        throw err
    }
}

/** Vom Admin angelegter Benutzer. Passwort wird hier gehasht. */
async function create({ username, password, fullname, imgUrl, isAdmin }) {
    try {
        if (!username || !password || !fullname) throw httpError(400, 'username, password und fullname sind Pflicht')
        if (String(password).length < 8) throw httpError(400, 'Passwort muss mindestens 8 Zeichen haben')
        if (await userRepo.findByUsername(username)) throw httpError(409, 'Benutzername bereits vergeben')

        const saved = await userRepo.insert({
            username,
            password: await bcrypt.hash(password, SALT_ROUNDS),
            fullname,
            imgUrl: imgUrl || '',
            isAdmin: isAdmin === true,
        })
        return withoutPassword(saved)
    } catch (err) {
        if (!err.status) logger.error('cannot create user', err)
        throw err
    }
}

/** Registrierung. Das Passwort ist hier bereits gehasht (auth.service). */
async function add(user) {
    try {
        const saved = await userRepo.insert({
            username: user.username,
            password: user.password,
            fullname: user.fullname,
            imgUrl: user.imgUrl || '',
            isAdmin: user.isAdmin === true,
        })
        return withoutPassword(saved)
    } catch (err) {
        logger.error('cannot add user', err)
        throw err
    }
}
