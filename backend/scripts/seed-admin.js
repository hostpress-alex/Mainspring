/**
 * Creates an admin or lifts an existing user to admin.
 *
 *   ADMIN_USER=alex ADMIN_PASS='...' ADMIN_NAME='Alex Neumann' npm run seed:admin
 *
 * The password is only stored as a bcrypt hash and shows up neither in the
 * code nor in the database in clear text. For an existing user the password is
 * overwritten — so the script is also the reset path.
 */
const bcrypt = require('bcrypt')
const userRepo = require('../api/user/user.repo')

const SALT_ROUNDS = 10

async function main(){
    const username = process.env.ADMIN_USER
    const password = process.env.ADMIN_PASS
    const fullname = process.env.ADMIN_NAME || username

    if(!username || !password){
        console.error('Fehlt: ADMIN_USER und ADMIN_PASS muessen gesetzt sein.')
        console.error('Beispiel: ADMIN_USER=alex ADMIN_PASS=\'geheim\' npm run seed:admin')
        process.exit(1)
    }
    if(password.length < 8){
        console.error('ADMIN_PASS ist kuerzer als 8 Zeichen. Abbruch.')
        process.exit(1)
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS)
    const existing = await userRepo.findByUsername(username)

    if(existing){
        await userRepo.updateFields(existing._id, {password: hash, isAdmin: true, fullname})
        console.log(`Benutzer "${username}" aktualisiert: Passwort neu gesetzt, isAdmin=true`)
        console.log(`  _id=${existing._id}`)
        return
    }

    const saved = await userRepo.insert({
        username,
        password: hash,
        fullname,
        imgUrl: '',
        isAdmin: true
    })
    console.log(`Admin "${username}" angelegt.`)
    console.log(`  _id=${saved._id}`)
}

/** Otherwise the MariaDB connection keeps the process open. */
async function closeAll(){
    try {
        await require('../db/knex').destroy()
    } catch(err) { /* no MariaDB involved */
    }
}

main().then(async() => {
    await closeAll();
    process.exit(0)
}).catch(async err => {
    console.error('seed-admin fehlgeschlagen:', err);
    await closeAll();
    process.exit(1)
})
