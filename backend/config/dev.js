module.exports = {
  // Which database is used: 'mongo' or 'mariadb'.
  // Switch without touching code:  DB_DRIVER=mariadb npm start
  driver: process.env.DB_DRIVER || 'mongo',

  // Local MongoDB. 127.0.0.1 rather than localhost, so that Node does not go
  // through ::1 (IPv6) while the service only binds IPv4.
  dbURL: process.env.MONGO_URL || 'mongodb://127.0.0.1:27017',
  dbName: process.env.MONGO_DB || 'monday_DB',

  // MariaDB. ServBay runs it on 3306.
  mysql: {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'projectmanager',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DB || 'projectmanager',
  },

  // Origins allowed to talk to this server — used by both the REST API and
  // the socket. In development the frontend runs on its own Vite port and is
  // therefore a different origin, so it has to be named here. One list for
  // both, so the socket can never end up more permissive than the API by
  // accident, which is exactly what happened before.
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://127.0.0.1:3000,http://localhost:3000,http://project.buff:3000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
}
