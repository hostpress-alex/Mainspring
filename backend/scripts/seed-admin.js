/**
 * Legt einen Admin an oder hebt einen bestehenden Benutzer zum Admin hoch.
 *
 *   ADMIN_USER=alex ADMIN_PASS='...' ADMIN_NAME='Alex Neumann' npm run seed:admin
 *
 * Das Passwort wird nur als bcrypt-Hash gespeichert und taucht weder im Code
 * noch in der Datenbank im Klartext auf. Bei einem bestehenden Benutzer wird
 * das Passwort ueberschrieben — damit ist das Skript auch der Reset-Weg.
 *
 * Schreibt in die Datenbank, die DB_DRIVER vorgibt:
 *   npm run seed:admin                     -> was in backend/.env steht
 *   DB_DRIVER=mariadb npm run seed:admin   -> ausdruecklich MariaDB
 */
const bcrypt = require('bcrypt')
const config = require('../config')
const userRepo = require('../api/user/user.repo')

const SALT_ROUNDS = 10

async function main() {
    const username = process.env.ADMIN_USER
    const password = process.env.ADMIN_PASS
    const fullname = process.env.ADMIN_NAME || username

    if (!username || !password) {
        console.error('Fehlt: ADMIN_USER und ADMIN_PASS muessen gesetzt sein.')
        console.error("Beispiel: ADMIN_USER=alex ADMIN_PASS='geheim' npm run seed:admin")
        process.exit(1)
    }
    if (password.length < 8) {
        console.error('ADMIN_PASS ist kuerzer als 8 Zeichen. Abbruch.')
        process.exit(1)
    }

    console.log(`Datenbank: ${config.driver}`)
    const hash = await bcrypt.hash(password, SALT_ROUNDS)
    const existing = await userRepo.findByUsername(username)

    if (existing) {
        await userRepo.updateFields(existing._id, { password: hash, isAdmin: true, fullname })
        console.log(`Benutzer "${username}" aktualisiert: Passwort neu gesetzt, isAdmin=true`)
        console.log(`  _id=${existing._id}`)
        return
    }

    const saved = await userRepo.insert({
        username,
        password: hash,
        fullname,
        imgUrl: '',
        isAdmin: true,
    })
    console.log(`Admin "${username}" angelegt.`)
    console.log(`  _id=${saved._id}`)
}

/** Die MariaDB-Verbindung haelt den Prozess sonst offen. */
async function closeAll() {
    try { await require('../db/knex').destroy() } catch (err) { /* kein MariaDB im Spiel */ }
}

main()
    .then(async () => { await closeAll(); process.exit(0) })
    .catch(async err => { console.error('seed-admin fehlgeschlagen:', err); await closeAll(); process.exit(1) })
