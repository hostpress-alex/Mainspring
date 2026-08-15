/**
 * Uploads gehen an das eigene Backend (POST /api/upload) und landen dort als
 * Datei unter backend/uploads/. Zurueck kommt ein Pfad wie /api/upload/<id>,
 * der ueberall als src verwendet werden kann.
 *
 * Frueher ging hier jedes Bild an einen fremden Cloudinary-Account.
 */
const UPLOAD_URL = '/api/upload'

/** Avatare werden vor dem Upload verkleinert — Fotos aus dem Handy sind sonst riesig. */
const AVATAR_SIDE = 256
const AVATAR_QUALITY = 0.85

export const uploadService = {
    uploadFile,
    uploadAvatar,
    imagesFromClipboard,
    uploadImg, // alte Signatur, s.u.
}

/**
 * Laedt eine Datei oder einen Blob hoch. Funktioniert mit File-Objekten aus
 * einem <input type="file">, mit Drag&Drop und mit Blobs aus der Zwischenablage.
 * Gibt { _id, url, mime, size } zurueck.
 */
/**
 * opts.scope: 'profile' -> uploads/profile/
 *             'task' + opts.taskId -> uploads/task/<taskId>/
 * ohne Angabe landet die Datei unter uploads/misc/<jahr>/<monat>/
 */
export async function uploadFile (fileOrBlob, opts = {}) {
    if (!fileOrBlob) throw new Error('Keine Datei ausgewaehlt')
    const params = new URLSearchParams()
    if (opts.scope) params.set('scope', opts.scope)
    if (opts.taskId) params.set('taskId', opts.taskId)
    // Der Server braucht den Namen fuer zwei Dinge: den Download-Namen und —
    // wenn der Browser keinen brauchbaren Typ meldet — die Typerkennung.
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

/** Verkleinert auf einen quadratischen Mittelausschnitt und laedt hoch. */
export async function uploadAvatar (file) {
    if (!file) throw new Error('Keine Datei ausgewaehlt')
    if (!file.type.startsWith('image/')) throw new Error('Das ist kein Bild')
    const blob = await resizeToSquare(file, AVATAR_SIDE, AVATAR_QUALITY)
    return uploadFile(blob, { scope: 'profile' })
}

/**
 * Bilder aus einem Paste-Event ziehen. Fuer spaetere Verwendung in Task-Updates:
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
        reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'))
        reader.onload = () => {
            const img = new Image()
            img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'))
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
                    blob => blob ? resolve(blob) : reject(new Error('Bild konnte nicht verarbeitet werden')),
                    'image/jpeg',
                    quality
                )
            }
            img.src = reader.result
        }
        reader.readAsDataURL(file)
    })
}

/** Kompatibel zur alten Signatur (Change-Event vom File-Input). */
async function uploadImg (ev) {
    const file = ev?.target?.files?.[0]
    const { url } = await uploadAvatar(file)
    return { secure_url: url, width: AVATAR_SIDE, height: AVATAR_SIDE }
}
