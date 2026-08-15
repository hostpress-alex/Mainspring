/**
 * Connection to MariaDB.
 *
 * The connection is opened on first use, not when this file is loaded, so a
 * script that only needs config does not drag a database connection along.
 */
const config = require('../config')

let instance = null

function db(){
    if(instance) return instance
    const cfg = config.mysql || {}
    if(!cfg.host || !cfg.user || !cfg.database){
        throw new Error('MariaDB is not configured: set MYSQL_HOST, MYSQL_USER and MYSQL_DB')
    }
    instance = require('knex')({
        client: 'mysql2',
        migrations: {directory: require('path').join(__dirname, 'migrations'), tableName: 'knex_migrations'},
        connection: {
            host: cfg.host,
            port: cfg.port,
            user: cfg.user,
            password: cfg.password,
            database: cfg.database,
            charset: 'utf8mb4',
            timezone: 'Z',
            supportBigNumbers: true,
            dateStrings: false
        },
        pool: {min: 0, max: 10}
    })
    return instance
}

async function destroy(){
    if(!instance) return
    await instance.destroy()
    instance = null
}

/**
 * MariaDB stores JSON as LONGTEXT. Depending on the version and the driver
 * the value comes back either as a string or already unpacked — so it is
 * caught here once instead of in thirty different places.
 *
 * Worth knowing: mysql2 unpacks JSON columns by itself. If a column holds the
 * JSON value "Progress", what arrives here is the finished string Progress —
 * which is not valid JSON in its own right. That used to fall through to the
 * fallback and get lost. So if unpacking fails, the value was already
 * unpacked and is passed through untouched.
 */
function parseJson(value, fallback = null){
    if(value === null || value === undefined) return fallback
    if(typeof value !== 'string') return value
    try {
        return JSON.parse(value)
    } catch(err) {
        return value
    }
}

/** Counterpart to parseJson: null stays null, everything else gets packed. */
function toJson(value){
    if(value === undefined || value === null) return null
    return JSON.stringify(value)
}

/**
 * Check at start-up whether every migration has run.
 *
 * Without this check the server comes up on half a schema: reading works,
 * writing falls over in exactly one place, and in the interface it looks as
 * if a single button is broken. Better to stop loudly.
 */
async function assertMigrated(){
    const [, pending] = await db().migrate.list()
    if(!pending.length) return
    const names = pending.map(p => (typeof p === 'string'?p:p.file || p.name)).join(', ')
    const err = new Error(
        `${pending.length} database migration(s) are missing: ${names}\n` +
        '   Please run this in the backend folder:  npm run db:migrate')
    err.code = 'MIGRATIONS_PENDING'
    throw err
}

module.exports = {db, destroy, parseJson, toJson, assertMigrated}
