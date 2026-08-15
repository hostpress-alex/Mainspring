/**
 * Zugangsdaten und Schalter.
 *
 * Werte kommen aus Umgebungsvariablen. Liegt im Ordner backend eine Datei
 * .env, wird sie zusaetzlich eingelesen — praktisch fuer die Entwicklung.
 * Fehlt das Paket dotenv, laeuft alles weiter, dann zaehlen nur die echten
 * Umgebungsvariablen.
 */
try {
  require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env'), quiet: true })
} catch (err) {
  // dotenv ist optional.
}

var config

if (process.env.NODE_ENV === 'production') {
  config = require('./prod')
} else {
  config = require('./dev')
}
// Guest-Mode haengt die komplette Auth aus. Nur zum Debuggen einschalten:
//   GUEST_MODE=true npm start
config.isGuestMode = process.env.GUEST_MODE === 'true'

// Oeffentliche Registrierung. Auf einem erreichbaren Server ALLOW_SIGNUP=false
// setzen, sonst legt sich jeder selbst einen Account an und sieht alle Boards.
config.allowSignup = process.env.ALLOW_SIGNUP !== 'false'

module.exports = config
