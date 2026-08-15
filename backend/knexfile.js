/**
 * Nur fuer das Kommandozeilenwerkzeug von Knex (Migrationen).
 * Die Anwendung selbst verbindet ueber db/knex.js.
 *
 *   npx knex migrate:latest
 *   npx knex migrate:rollback
 *   npx knex migrate:status
 */
const config = require('./config')

module.exports = {
    client: 'mysql2',
    connection: {...config.mysql, charset: 'utf8mb4', timezone: 'Z'},
    migrations: {directory: './db/migrations', tableName: 'knex_migrations'},
    pool: {min: 0, max: 5}
}
