import {t} from '../i18n'

/**
 * Uploads go to our own backend (POST /api/upload) and end up there as a file
 * under backend/uploads/. What comes back is a path like /api/upload/<id> that
 * can be used as a src anywhere.
 *
 * Every image used to go to a stranger's Cloudinary account.
 */
const UPLOAD_URL = '/api/upload'

/** Avatars are scaled down before upload — photos from a phone are huge otherwise. */
const AVATAR_SIDE = 256
const AVATAR_QUALITY = 0.85

export const uploadService = {
    uploadFile,
    uploadAvatar,
    imagesFromClipboard,
    uploadImg // alte Signatur, s.u.
}

/**
 * Uploads a file or a blob. Works with File objects from an
 * <input type="file">, with drag & drop and with blobs from the clipboard.
 * Returns { _id, url, mime, size }.
 */
/**
 * opts.scope: 'profile' -> uploads/profile/
 *             'task' + opts.taskId -> uploads/task/<taskId>/
 * without one, the file ends up under uploads/misc/<year>/<month>/
 */
export async function uploadFile(fileOrBlob, opts = {}){
    if(!fileOrBlob) throw new Error(t('file.noneSelected'))
    // Attachments go straight into the request body, so an unreadable file
    // would surface as a failed upload with nothing to act on. Same check,
    // same message as for avatars.
    await assertReadable(fileOrBlob)
    const params = new URLSearchParams()
    if(opts.scope) params.set('scope', opts.scope)
    if(opts.taskId) params.set('taskId', opts.taskId)
    // The board decides who may download this again. Worked out here rather
    // than from the task on the server: a task's key is (board_id, id), so a
    // lookup by task id alone is unique only by luck.
    if(opts.boardId) params.set('boardId', opts.boardId)
    // The server needs the name for two things: the download name and —
    // when the browser reports no usable type — working out the type.
    const name = opts.name || fileOrBlob.name
    if(name) params.set('name', name)
    const url = params.toString()?`${UPLOAD_URL}?${params}`:UPLOAD_URL
    const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {'Content-Type': fileOrBlob.type || 'application/octet-stream'},
        body: fileOrBlob
    })
    const data = await res.json().catch(() => ({}))
    if(!res.ok) throw new Error(data.err || `Upload fehlgeschlagen (${res.status})`)
    return data
}

/** Scales down to a square centre crop and uploads it. */
export async function uploadAvatar(file){
    if(!file) throw new Error(t('file.noneSelected'))
    if(!file.type.startsWith('image/')) throw new Error(t('file.notAnImage'))
    const blob = await resizeToSquare(file, AVATAR_SIDE, AVATAR_QUALITY)
    return uploadFile(blob, {scope: 'profile'})
}

/**
 * Pull images out of a paste event. For later use in task updates:
 *   onPaste={async ev => { for (const b of imagesFromClipboard(ev)) await uploadFile(b) }}
 */
export function imagesFromClipboard(ev){
    const items = ev?.clipboardData?.items || []
    const blobs = []
    for(const item of items){
        if(item.kind === 'file' && item.type.startsWith('image/')){
            const blob = item.getAsFile()
            if(blob) blobs.push(blob)
        }
    }
    return blobs
}

/**
 * Decode an image file into something drawable.
 *
 * The first attempt used FileReader + a data URL, and it failed on ordinary
 * JPEGs with nothing but "could not be read". Two reasons to stop doing that:
 *
 *   - It reads the whole file into a base64 string first, roughly 1.3x the
 *     file size, before anything is decoded. A photo straight from a phone is
 *     a lot of string.
 *   - When it does fail, the reason is in `reader.error.name` — NotReadableError
 *     for a file that is on iCloud Drive and not downloaded, NotFoundError for
 *     one that moved after being picked — and that name was thrown away.
 *
 * createImageBitmap decodes from the file directly. `imageOrientation` makes
 * it honour the EXIF rotation, which is why portrait photos from a phone no
 * longer end up sideways in the avatar.
 */
async function decodeImage(file){
    await assertReadable(file)

    if(typeof createImageBitmap === 'function'){
        try {
            return await createImageBitmap(file, {imageOrientation: 'from-image'})
        } catch(err){
            // Older browsers reject the options object rather than ignoring
            // it. Worth one more go without it before falling back.
            try {
                return await createImageBitmap(file)
            } catch(err2){
                throw readError(err2)
            }
        }
    }

    // Fallback: an object URL, still without turning the file into a string.
    const url = URL.createObjectURL(file)
    try {
        return await new Promise((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve(img)
            img.onerror = () => reject(new Error(t('file.notDecodable')))
            img.src = url
        })
    } finally {
        URL.revokeObjectURL(url)
    }
}

/**
 * Turn a browser error name into something the person can act on.
 *
 * The names are the useful part and the sentence around them is not, so each
 * known one gets its own text. Anything unknown keeps the name visible rather
 * than hiding behind "something went wrong" — that is what made this bug take
 * three attempts to find.
 */
const READ_ERRORS = {
    NotReadableError: 'file.notReadable',
    NotFoundError: 'file.notFound',
    SecurityError: 'file.notAllowed',
    InvalidStateError: 'file.notDecodable'
}

function readError(err){
    const name = err && err.name
    const key = name && READ_ERRORS[name]
    if(key) return new Error(t(key))
    return new Error(name?t('file.readFailedWhy', {reason: name}):t('file.readFailed'))
}

/**
 * Read sixteen bytes before doing anything else.
 *
 * Not paranoia — it is what makes the message match the cause. A file that
 * cannot be read at all (an iCloud placeholder that was never downloaded, a
 * volume that went away) makes createImageBitmap report InvalidStateError,
 * "the source image could not be decoded", because from its side that is all
 * that is true: it got no bytes. The person then hears their picture is
 * broken when in fact it is simply not there.
 *
 * A slice of sixteen bytes costs nothing and surfaces the real
 * NotReadableError, so the difference between "your file is damaged" and
 * "your file is not on this computer" can actually be told.
 */
async function assertReadable(file){
    try {
        await file.slice(0, 16).arrayBuffer()
    } catch(err){
        throw readError(err)
    }
}

async function resizeToSquare(file, side, quality){
    const img = await decodeImage(file)
    const width = img.width, height = img.height
    if(!width || !height) throw new Error(t('file.imageReadFailed'))

    // Centre crop to a square, then scale to the target side.
    const src = Math.min(width, height)
    const sx = (width - src) / 2
    const sy = (height - src) / 2

    const canvas = document.createElement('canvas')
    canvas.width = side
    canvas.height = side
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, sx, sy, src, src, 0, 0, side, side)

    // An ImageBitmap holds decoded pixels until it is closed. Without this the
    // memory stays taken for as long as the page is open.
    if(typeof img.close === 'function') img.close()

    return await new Promise((resolve, reject) => {
        canvas.toBlob(
            blob => blob?resolve(blob):reject(new Error(t('file.imageFailed'))),
            'image/jpeg',
            quality
        )
    })
}

/** Compatible with the old signature (change event from the file input). */
async function uploadImg(ev){
    const file = ev?.target?.files?.[0]
    const {url} = await uploadAvatar(file)
    return {secure_url: url, width: AVATAR_SIDE, height: AVATAR_SIDE}
}
