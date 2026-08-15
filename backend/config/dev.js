module.exports = {
  // Welche Datenbank benutzt wird: 'mongo' oder 'mariadb'.
  // Umschalten ohne Codeaenderung:  DB_DRIVER=mariadb npm start
  driver: process.env.DB_DRIVER || 'mongo',

  // Lokales MongoDB. 127.0.0.1 statt localhost, damit Node nicht ueber ::1
  // (IPv6) laeuft — der Dienst bindet nur IPv4.
  dbURL: process.env.MONGO_URL || 'mongodb://127.0.0.1:27017',
  dbName: process.env.MONGO_DB || 'monday_DB',

  // MariaDB. In ServBay laeuft sie auf 3306.
  mysql: {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'projectmanager',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DB || 'projectmanager',
  },
}
