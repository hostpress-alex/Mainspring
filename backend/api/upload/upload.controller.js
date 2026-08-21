/**
 * Uploading and serving one file.
 *
 * Both halves of the board permission live here, and both were missing.
 *
 * The column, the migration, the frontend parameter and three documents all
 * said an upload belongs to a board and is checked against it. The two lines
 * that would have made it true were never written: `boardId` arrived in the
 * query string and was dropped here, so `file.board_id` was NULL on every
 * upload; and `serveFile` looked the file up by id and streamed it, so any
 * signed-in person could fetch any file whose id they had seen.
 *
 * The id is 32 random hex characters, which is not a permission. It stops
 * guessing and does nothing about a URL that was noted down, forwarded, or
 * left in a browser history after somebody was taken off the board.
 */
const fileService = require('../../services/file.service')
const boardRepo = require('../board/board.repo')
const logger = require('../../services/logger.service')
const asyncLocalStorage = require('../../services/als.service')

function getUser(){
    const store = asyncLocalStorage.getStore()
    return (store && store.loggedinUser) || null
}

/**
 * May this person read this file?
 *
 * A file with no board is open to anybody signed in, and that is deliberate:
 * profile pictures live in this same table, and an avatar only its owner can
 * see is not an avatar.
 *
 * Membership is one indexed row, not a board assembly — every image in a
 * comment would otherwise be a full board read. An admin passes, the same way
 * an admin may read every board through the API.
 */
async function mayRead(doc, user){
    if(!doc || !doc.boardId) return true
    if(!user) return false
    if(user.isAdmin) return true
    return await boardRepo.isMember(doc.boardId, user._id)
}

async function uploadFile(req, res){
    try {
        const mime = (req.headers['content-type'] || '').split(';')[0].trim()
        const user = getUser()
        const boardId = req.query.boardId || null

        // Uploading INTO a board is writing to it, and a file nobody may read
        // is not worth storing. Checked before the bytes reach the disk.
        if(boardId && !(user && user.isAdmin) && !await boardRepo.isMember(boardId, user && user._id)){
            throw Object.assign(new Error('Kein Zugriff auf dieses Board'), {status: 403})
        }

        const saved = await fileService.save(req.body, mime, user, {
            scope: req.query.scope,
            taskId: req.query.taskId,
            // Was missing. Without it `file.board_id` stays NULL, which means
            // the file belongs to no board — and a file that belongs to no
            // board is readable by anybody signed in.
            boardId,
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

        // A refusal is a 404 and not a 403, so the answer does not say which
        // ids exist. The two cases are indistinguishable from outside, which
        // is the point.
        if(!await mayRead(doc, getUser())) throw Object.assign(new Error('Datei nicht gefunden'), {status: 404})

        res.set('Content-Type', doc.mime)
        res.set('Content-Length', String(doc.size))
        // Contents are immutable (id = content), so they may sit in the
        // browser cache for a long time. private, because they need a login.
        res.set('Cache-Control', 'private, max-age=31536000, immutable')

        // Only images and PDF are shown inline. Everything else is downloaded
        // — SVG above all, which would otherwise run as a page in the
        // application's own context and could execute scripts.
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

module.exports = {uploadFile, serveFile, mayRead}
