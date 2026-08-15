/**
 * Verbindung zur MariaDB.
 *
 * Die Verbindung wird erst beim ersten Zugriff aufgebaut. Laeuft der Server
 * mit DB_DRIVER=mongo, wird diese Datei zwar geladen, aber nie verbunden —
 * MariaDB muss dann gar nicht laufen.
 */
const config = require('../config')

let instance = null

function db() {
    if (instance) return instance
    const cfg = config.mysql || {}
    if (!cfg.host || !cfg.user || !cfg.database) {
        throw new Error('MariaDB ist nicht konfiguriert: MYSQL_HOST, MYSQL_USER und MYSQL_DB setzen')
    }
    instance = require('knex')({
        client: 'mysql2',
        migrations: { directory: require('path').join(__dirname, 'migrations'), tableName: 'knex_migrations' },
        connection: {
            host: cfg.host,
            port: cfg.port,
            user: cfg.user,
            password: cfg.password,
            database: cfg.database,
            charset: 'utf8mb4',
            timezone: 'Z',
            supportBigNumbers: true,
            dateStrings: false,
        },
        pool: { min: 0, max: 10 },
    })
    return instance
}

async function destroy() {
    if (!instance) return
    await instance.destroy()
    instance = null
}

/**
 * MariaDB legt JSON als LONGTEXT ab. Je nach Version und Treiber kommt der
 * Wert als Zeichenkette oder bereits ausgepackt zurueck — deshalb hier
 * einmal zentral abfangen statt an dreissig Stellen.
 *
 * Wichtig: mysql2 packt JSON-Spalten selbst aus. Steht in der Spalte der
 * JSON-Wert "Progress", kommt hier die fertige Zeichenkette Progress an —
 * und die ist ihrerseits kein gueltiges JSON. Frueher landete sie deshalb
 * im Fallback und war weg. Schlaegt das Auspacken fehl, war der Wert also
 * schon ausgepackt und wird unveraendert durchgereicht.
 */
function parseJson(value, fallback = null) {
    if (value === null || value === undefined) return fallback
    if (typeof value !== 'string') return value
    try {
        return JSON.parse(value)
    } catch (err) {
        return value
    }
}

/** Gegenstueck zu parseJson: null bleibt null, alles andere wird verpackt. */
function toJson(value) {
    if (value === undefined || value === null) return null
    return JSON.stringify(value)
}

/**
 * Beim Start pruefen, ob alle Migrationen gelaufen sind.
 *
 * Ohne diese Pruefung startet der Server mit einem halben Schema: Lesen geht,
 * Schreiben faellt an genau einer Stelle auf die Nase, und in der Oberflaeche
 * sieht es aus, als waere ein Knopf kaputt. Lieber laut abbrechen.
 */
async function assertMigrated() {
    const [, pending] = await db().migrate.list()
    if (!pending.length) return
    const namen = pending.map(p => (typeof p === 'string' ? p : p.file || p.name)).join(', ')
    const err = new Error(
        `Es fehlen ${pending.length} Datenbank-Migration(en): ${namen}\n` +
        '   Bitte im Ordner backend ausfuehren:  npm run db:migrate')
    err.code = 'MIGRATIONS_PENDING'
    throw err
}

module.exports = { db, destroy, parseJson, toJson, assertMigrated }
