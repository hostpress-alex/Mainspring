const express = require('express')
const { requireAuth } = require('../../middlewares/requireAuth.middleware')
const fileService = require('../../services/file.service')
const { uploadFile, serveFile } = require('./upload.controller')

const router = express.Router()

router.use(requireAuth)

// Rohe Bytes statt multipart: kein zusaetzliches Paket noetig, und der Browser
// kann ein File- oder Blob-Objekt (auch aus der Zwischenablage) direkt senden.
//
// type: '*/*' ist Absicht. Frueher stand hier die Liste der erlaubten MIME-Typen
// — dann liess Express den Rumpf bei allem anderen einfach weg, und der Server
// meldete "Leere Datei" statt "Dateityp nicht erlaubt". Schlimmer: Browser
// schicken fuer Office-Dateien haeufig application/octet-stream, die kamen so
// nie an. Welche Typen wirklich erlaubt sind, entscheidet der file.service —
// das Groessenlimit greift hier davor.
router.post('/', express.raw({
    type: '*/*',
    limit: fileService.MAX_BYTES,
}), uploadFile)

router.get('/:id', serveFile)

module.exports = router
