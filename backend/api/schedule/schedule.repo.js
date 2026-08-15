/**
 * Speicherzugriff auf Kalendereintraege. Waehlt nur aus — siehe board.repo.js.
 */
const config = require('../../config')

const DRIVERS = {
    mongo: () => require('./schedule.repo.mongo'),
    mariadb: () => require('./schedule.repo.sql'),
    mysql: () => require('./schedule.repo.sql'),
}

const driver = String(config.driver || 'mongo').toLowerCase()
const load = DRIVERS[driver]
if (!load) throw new Error(`Unbekannter DB_DRIVER "${driver}"`)

module.exports = load()
