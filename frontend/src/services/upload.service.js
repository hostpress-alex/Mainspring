import { t } from '../i18n'
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
    uploadImg, // alte Signatur, s.u.
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
export async function uploadFile (fileOrBlob, opts = {}) {
    if (!fileOrBlob) throw new Error(t('file.noneSelected'))
    const params = new URLSearchParams()
    if (opts.scope) params.set('scope', opts.scope)
    if (opts.taskId) params.set('taskId', opts.taskId)
    // The server needs the name for two things: the download name and —
    // when the browser reports no usable type — working out the type.
    const name = opts.name || fileOrBlob.name
    if (name) params.set('name', name)
    const url = params.toString() ? `${UPLOAD_URL}?${params}` : UPLOAD_URL
    const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': fileOrBlob.type || 'application/octet-stream' },
        body: fileOrBlob,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.err || `Upload fehlgeschlagen (${res.status})`)
    return data
}

/** Scales down to a square centre crop and uploads it. */
export async function uploadAvatar (file) {
    if (!file) throw new Error(t('file.noneSelected'))
    if (!file.type.startsWith('image/')) throw new Error(t('file.notAnImage'))
    const blob = await resizeToSquare(file, AVATAR_SIDE, AVATAR_QUALITY)
    return uploadFile(blob, { scope: 'profile' })
}

/**
 * Pull images out of a paste event. For later use in task updates:
 *   onPaste={async ev => { for (const b of imagesFromClipboard(ev)) await uploadFile(b) }}
 */
export function imagesFromClipboard (ev) {
    const items = ev?.clipboardData?.items || []
    const blobs = []
    for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const blob = item.getAsFile()
            if (blob) blobs.push(blob)
        }
    }
    return blobs
}

function resizeToSquare (file, side, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error(t('file.readFailed')))
        reader.onload = () => {
            const img = new Image()
            img.onerror = () => reject(new Error(t('file.imageReadFailed')))
            img.onload = () => {
                const src = Math.min(img.width, img.height)
                const sx = (img.width - src) / 2
                const sy = (img.height - src) / 2
                const canvas = document.createElement('canvas')
                canvas.width = side
                canvas.height = side
                const ctx = canvas.getContext('2d')
                ctx.imageSmoothingQuality = 'high'
                ctx.drawImage(img, sx, sy, src, src, 0, 0, side, side)
                canvas.toBlob(
                    blob => blob ? resolve(blob) : reject(new Error(t('file.imageFailed'))),
                    'image/jpeg',
                    quality
                )
            }
            img.src = reader.result
        }
        reader.readAsDataURL(file)
    })
}

/** Compatible with the old signature (change event from the file input). */
async function uploadImg (ev) {
    const file = ev?.target?.files?.[0]
    const { url } = await uploadAvatar(file)
    return { secure_url: url, width: AVATAR_SIDE, height: AVATAR_SIDE }
}
