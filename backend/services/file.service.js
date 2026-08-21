/**
 * Files on disk, metadata in the database.
 *
 * Files live under backend/uploads/<year>/<month>/<id>.<ext> — deliberately
 * NOT under public/, so they cannot be served unprotected by accident.
 * Serving goes through GET /api/upload/:id with requireAuth.
 */
const fs = require('fs/promises')
const fsSync = require('fs')
const path = require('path')
const crypto = require('crypto')
const fileRepo = require('./file.repo')
const logger = require('./logger.service')

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads')

/**
 * Allowed file types.
 *
 * Deliberately a list and not "everything except exe": what is not in here
 * does not get onto the disk. Executables, scripts and HTML are missing on
 * purpose.
 */
const ALLOWED = {
    // Bilder
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/tiff': 'tif',
    'image/heic': 'heic',
    // Dokumente
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.oasis.opendocument.text': 'odt',
    'application/rtf': 'rtf',
    // Tabellen
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.oasis.opendocument.spreadsheet': 'ods',
    // Praesentationen
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.oasis.opendocument.presentation': 'odp',
    // text and data
    'text/plain': 'txt',
    'text/csv': 'csv',
    'text/markdown': 'md',
    'application/json': 'json',
    'text/xml': 'xml',
    'application/xml': 'xml',
    // Archive
    'application/zip': 'zip',
    'application/x-7z-compressed': '7z'
}

/**
 * Fallback via the file extension.
 *
 * For Office files browsers like to send application/octet-stream or nothing
 * at all, depending on the operating system. Without this path a .docx could
 * not be uploaded even though it is allowed.
 */
const BY_EXTENSION = Object.fromEntries(
    Object.entries(ALLOWED).map(([mime, ext]) => [ext, mime]))

const VAGUE_MIMES = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/x-zip-compressed'])

/** Images and PDF may be shown inline by the browser. Everything else is downloaded. */
const INLINE_MIMES = new Set([
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'application/pdf'
])

const MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024)

function httpError(status, msg){
    const err = new Error(msg)
    err.status = status
    return err
}

function isAllowed(mime){
    return Object.prototype.hasOwnProperty.call(ALLOWED, mime)
}

/** Endung eines Dateinamens, klein geschrieben, ohne Punkt. */
function extensionOf(name){
    const match = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || ''))
    return match?match[1].toLowerCase():''
}

/**
 * Works out the real type from the reported MIME type and the file name.
 * Throws if neither of the two leads to an allowed type.
 */
function resolveType(mime, originalName){
    const clean = String(mime || '').toLowerCase().split(';')[0].trim()
    if(isAllowed(clean)) return {mime: clean, ext: ALLOWED[clean]}

    const ext = extensionOf(originalName)
    if(ext && BY_EXTENSION[ext] && (VAGUE_MIMES.has(clean) || !clean)){
        return {mime: BY_EXTENSION[ext], ext}
    }
    throw httpError(415, `Dateityp ${mime || 'unbekannt'} ist nicht erlaubt`)
}

/** Only for the download name: no paths, no quotes. */
function safeFilename(name, fallbackExt){
    const clean = String(name || '').replace(/[\\/\r\n"]/g, '').trim().slice(0, 120)
    if(clean) return clean
    return `datei.${fallbackExt}`
}

function isInline(mime){
    return INLINE_MIMES.has(mime)
}

/** Allows harmless path segments only — no slashes, no dots. */
function safeSegment(value){
    const clean = String(value || '').replace(/[^A-Za-z0-9_-]/g, '')
    return clean.slice(0, 64)
}

/**
 * Target folder by purpose:
 *   profile              -> uploads/profile/
 *   task + taskId        -> uploads/task/<taskId>/
 *   everything else      -> uploads/misc/<year>/<month>/
 */
function targetDir(scope, taskId, now){
    if(scope === 'profile') return 'profile'
    if(scope === 'task'){
        const id = safeSegment(taskId)
        if(!id) throw httpError(400, 'taskId fehlt fuer scope=task')
        return path.join('task', id)
    }
    return path.join('misc', String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'))
}

async function save(buffer, mime, user, opts = {}){
    if(!buffer || !buffer.length) throw httpError(400, 'Leere Datei')

    /**
     * A file on a task must name its board.
     *
     * Without it `board_id` stays NULL, and NULL means "belongs to no board",
     * which means readable by anybody signed in. That is right for a profile
     * picture and wrong for an attachment, and the difference is one optional
     * parameter that a caller can forget — `FilePicker` even defaults its
     * `board` prop to null. So it is refused here rather than left to every
     * call site to get right: a loud failure beats a file that is quietly
     * public.
     */
    if(opts.scope === 'task' && !opts.boardId) throw httpError(400, 'boardId fehlt fuer scope=task')
    const type = resolveType(mime, opts.name)
    if(buffer.length > MAX_BYTES){
        throw httpError(413, `Datei ist groesser als ${Math.round(MAX_BYTES / 1024 / 1024)} MB`)
    }

    const id = crypto.randomBytes(16).toString('hex')
    const now = new Date()
    const rel = targetDir(opts.scope, opts.taskId, now)
    const dir = path.join(UPLOAD_ROOT, rel)
    await fs.mkdir(dir, {recursive: true})

    // On disk the file is named after its id — the original name only
    // goes into the database and is put back on download.
    const filename = `${id}.${type.ext}`
    await fs.writeFile(path.join(dir, filename), buffer)

    const originalName = safeFilename(opts.name, type.ext)
    const doc = {
        _id: id,
        relPath: path.join(rel, filename),
        mime: type.mime,
        size: buffer.length,
        scope: opts.scope || 'misc',
        originalName,
        taskId: opts.scope === 'task'?safeSegment(opts.taskId):null,
        // Written now rather than worked out later: a task's key is
        // (board_id, id), so looking a board up by task id alone is only
        // unique by luck, and a permission check may not rest on luck.
        boardId: opts.boardId?safeSegment(opts.boardId):null,
        uploadedBy: user?String(user._id):null,
        uploadedByName: user?user.fullname:null,
        createdAt: now
    }
    await fileRepo.insert(doc)

    return {_id: id, url: `/api/upload/${id}`, mime: type.mime, size: buffer.length, name: originalName}
}

async function getMeta(id){
    if(!/^[a-f0-9]{32}$/.test(String(id || ''))) throw httpError(404, 'Datei nicht gefunden')
    const doc = await fileRepo.findById(id)
    if(!doc) throw httpError(404, 'Datei nicht gefunden')
    return doc
}

/** Absolute path, guarded against escaping the upload directory. */
function absPathOf(doc){
    const abs = path.resolve(UPLOAD_ROOT, doc.relPath)
    if(!abs.startsWith(path.resolve(UPLOAD_ROOT) + path.sep)){
        throw httpError(400, 'Ungueltiger Pfad')
    }
    return abs
}

function createReadStream(doc){
    return fsSync.createReadStream(absPathOf(doc))
}

async function remove(id){
    const doc = await getMeta(id)
    try {
        await fs.unlink(absPathOf(doc))
    } catch(err) {
        logger.error('Datei nicht loeschbar', err)
    }
    await fileRepo.deleteById(id)
    return id
}

module.exports = {
    save, getMeta, createReadStream, remove,
    isAllowed, resolveType, safeSegment, safeFilename, isInline, extensionOf,
    UPLOAD_ROOT, MAX_BYTES, ALLOWED
}
