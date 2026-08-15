module.exports = {
  driver: process.env.DB_DRIVER || 'mongo',

  // No fallback in production: if the credentials are missing, the server
  // should die loudly.
  dbURL: process.env.MONGO_URL,
  dbName: process.env.MONGO_DB || 'monday_DB',

  mysql: {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB || 'projectmanager',
  },

  // In production this server also serves the built frontend, so everything
  // is same-origin and no cross-origin exception is needed. Set
  // ALLOWED_ORIGINS only when the frontend is hosted somewhere else.
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
}
