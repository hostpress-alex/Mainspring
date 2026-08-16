/**
 * Which icon belongs to a file.
 *
 * The file column used to show the file name, which never fits into a column
 * and told you nothing at a glance. One icon per type reads faster, and the
 * full name stays available as a tooltip.
 *
 * Decided by MIME type first (that is what the server stores), by extension
 * second — old entries have no MIME type.
 */

/**
 * Only icons that also exist in the free set — see vendor/README.md.
 * The field is called `faIcon` so scripts/check-icons.mjs finds these names
 * even though they are only chosen at runtime.
 */
const TYPES = [
    { key: 'image',       faIcon: 'file-image',      mime: /^image\//,                                    ext: /^(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/ },
    { key: 'pdf',         faIcon: 'file-pdf',        mime: /pdf/,                                         ext: /^pdf$/ },
    { key: 'word',        faIcon: 'file-word',       mime: /msword|wordprocessing|opendocument\.text/,    ext: /^(docx?|odt|rtf)$/ },
    { key: 'excel',       faIcon: 'file-excel',      mime: /excel|spreadsheet|csv|tab-separated/,                           ext: /^(xlsx?|ods|csv|tsv)$/ },
    { key: 'powerpoint',  faIcon: 'file-powerpoint', mime: /powerpoint|presentation/,                     ext: /^(pptx?|odp)$/ },
    { key: 'archive',     faIcon: 'file-zipper',     mime: /zip|compressed|x-7z|x-rar|x-tar|gzip/,        ext: /^(zip|7z|rar|tar|gz|bz2)$/ },
    { key: 'code',        faIcon: 'file-code',       mime: /json|xml|javascript|html|css/,                ext: /^(json|xml|ya?ml|html?|css|jsx?|tsx?|php|sql)$/ },
    { key: 'text',        faIcon: 'file-lines',      mime: /^text\//,                                     ext: /^(txt|md|log)$/ },
    { key: 'audio',       faIcon: 'file-audio',      mime: /^audio\//,                                    ext: /^(mp3|wav|ogg|m4a|flac)$/ },
    { key: 'video',       faIcon: 'file-video',      mime: /^video\//,                                    ext: /^(mp4|mov|avi|mkv|webm)$/ },
]

const UNKNOWN = { key: 'other', faIcon: 'file' }

function extensionOf(name = '') {
    const clean = String(name).split(/[?#]/)[0]
    const dot = clean.lastIndexOf('.')
    return dot > 0 ? clean.slice(dot + 1).toLowerCase() : ''
}

/**
 * @returns {{key: string, faIcon: string}} `key` becomes the CSS class
 *          (`is-pdf`, `is-word`, …), `faIcon` the Font Awesome name.
 */
export function fileType({ mime = '', name = '', url = '' } = {}) {
    const type = String(mime).toLowerCase()
    if (type) {
        const byMime = TYPES.find(entry => entry.mime.test(type))
        if (byMime) return byMime
    }
    const ext = extensionOf(name) || extensionOf(url)
    if (ext) {
        const byExt = TYPES.find(entry => entry.ext.test(ext))
        if (byExt) return byExt
    }
    return UNKNOWN
}

/** "2.4 MB" — for the tooltip, so the icon does not have to say everything. */
export function fileSize(bytes) {
    const value = Number(bytes)
    if (!Number.isFinite(value) || value <= 0) return ''
    const units = ['B', 'KB', 'MB', 'GB']
    let n = value
    let unit = 0
    while (n >= 1024 && unit < units.length - 1) { n /= 1024; unit++ }
    return `${n < 10 && unit > 0 ? n.toFixed(1) : Math.round(n)} ${units[unit]}`
}
