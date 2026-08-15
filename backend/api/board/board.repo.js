/**
 * Speicherzugriff auf Boards — die einzige Stelle, die weiss, wie ein Board
 * abgelegt ist.
 *
 * Diese Datei waehlt nur aus. Die eigentliche Arbeit steckt in:
 *   board.repo.mongo.js   MongoDB
 *   board.repo.sql.js     MariaDB
 *
 * Umschalten ohne Codeaenderung:
 *   DB_DRIVER=mariadb npm start
 *
 * Beide Umsetzungen haben dieselbe Aussenseite. Wird hier etwas ergaenzt,
 * muss es in BEIDEN Dateien ergaenzt werden — der Wechsel soll jederzeit in
 * beide Richtungen moeglich bleiben.
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
