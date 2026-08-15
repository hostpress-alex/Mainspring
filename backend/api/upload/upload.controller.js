const fileService = require('../../services/file.service')
const logger = require('../../services/logger.service')
const asyncLocalStorage = require('../../services/als.service')

function getUser(){
    const store = asyncLocalStorage.getStore()
    return (store && store.loggedinUser) || null
}

async function uploadFile(req, res){
    try {
        const mime = (req.headers['content-type'] || '').split(';')[0].trim()
        const saved = await fileService.save(req.body, mime, getUser(), {
            scope: req.query.scope,
            taskId: req.query.taskId,
            name: req.query.name
        })
        res.json(saved)
    } catch(err) {
        if(!err.status) logger.error('Upload fehlgeschlagen', err)
        res.status(err.status || 500).send({err: err.status?err.message:'Upload fehlgeschlagen'})
    }
}

async function serveFile(req, res){
    try {
        const doc = await fileService.getMeta(req.params.id)
        res.set('Content-Type', doc.mime)
        res.set('Content-Length', String(doc.size))
        // Inhalte sind unveraenderlich (ID = Inhalt), duerfen also lange im
        // Browser-Cache liegen. private, weil sie Login voraussetzen.
        res.set('Cache-Control', 'private, max-age=31536000, immutable')

        // Nur Bilder und PDF direkt anzeigen. Alles andere wird heruntergeladen —
        // insbesondere SVG, das sonst als Seite im Kontext der Anwendung laeuft
        // und damit Skripte ausfuehren koennte.
        const name = fileService.safeFilename(doc.originalName, fileService.extensionOf(doc.relPath) || 'bin')
        const disposition = fileService.isInline(doc.mime)?'inline':'attachment'
        res.set('Content-Disposition',
            `${disposition}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`)
        res.set('X-Content-Type-Options', 'nosniff')
        fileService.createReadStream(doc).on('error', () => res.status(404).end()).pipe(res)
    } catch(err) {
        if(!err.status) logger.error('Datei nicht auslieferbar', err)
        res.status(err.status || 500).send({err: err.status?err.message:'Datei nicht auslieferbar'})
    }
}

module.exports = {uploadFile, serveFile}
