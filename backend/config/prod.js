module.exports = {
  driver: process.env.DB_DRIVER || 'mongo',

  // Kein Fallback in Produktion: fehlt die Zugangsdatei, soll der Server laut sterben.
  dbURL: process.env.MONGO_URL,
  dbName: process.env.MONGO_DB || 'monday_DB',

  mysql: {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB || 'projectmanager',
  },
}
