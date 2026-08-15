/**
 * Metadaten hochgeladener Dateien. Waehlt nur aus — siehe board.repo.js.
 */
const config = require('../config')

const DRIVERS = {
    mongo: () => require('./file.repo.mongo'),
    mariadb: () => require('./file.repo.sql'),
    mysql: () => require('./file.repo.sql'),
}

const driver = String(config.driver || 'mongo').toLowerCase()
const load = DRIVERS[driver]
if (!load) throw new Error(`Unbekannter DB_DRIVER "${driver}"`)

module.exports = load()
