/**
 * Storage access for boards — the only place that knows how a board is
 * stored.
 *
 * This file only picks. The actual work sits in:
 *   board.repo.mongo.js   MongoDB
 *   board.repo.sql.js     MariaDB
 *
 * Switching without a code change:
 *   DB_DRIVER=mariadb npm start
 *
 * Both implementations have the same outside. If something is added here,
 * it has to be added in BOTH files — switching should stay possible in both
 * directions at any time.
 */
const config = require('../../config')

const DRIVERS = {
    mongo: () => require('./board.repo.mongo'),
    mariadb: () => require('./board.repo.sql'),
    mysql: () => require('./board.repo.sql'),
}

const driver = String(config.driver || 'mongo').toLowerCase()
const load = DRIVERS[driver]
if (!load) {
    throw new Error(`Unbekannter DB_DRIVER "${driver}" — erlaubt sind: ${Object.keys(DRIVERS).join(', ')}`)
}

module.exports = load()
