/**
 * Speicherzugriff auf Benutzer. Waehlt nur aus — siehe board.repo.js.
 *   DB_DRIVER=mongo     -> user.repo.mongo.js
 *   DB_DRIVER=mariadb   -> user.repo.sql.js
 */
const config = require('../../config')

const DRIVERS = {
    mongo: () => require('./user.repo.mongo'),
    mariadb: () => require('./user.repo.sql'),
    mysql: () => require('./user.repo.sql'),
}

const driver = String(config.driver || 'mongo').toLowerCase()
const load = DRIVERS[driver]
if (!load) throw new Error(`Unbekannter DB_DRIVER "${driver}"`)

module.exports = load()
