/**
 * What a file can be shown as, and how its text is turned into something
 * readable.
 *
 * The rule for what is previewable is deliberately narrow, and the reason is
 * security rather than effort. Anything shown in an `<iframe>` from our own
 * origin runs in our origin — an uploaded .svg or .html would execute with the
 * logged-in session behind it. The server already knows this and serves
 * everything except images and PDF as `attachment`.
 *
 * So there are exactly two ways a file gets on screen here:
 *
 *  - images and PDF, which the browser renders and which the server has
 *    marked inline,
 *  - text, which is FETCHED and rendered by us as React nodes. `fetch` reads
 *    the body no matter what Content-Disposition says, so this needs no change
 *    on the server and opens nothing: the bytes never become markup.
 *
 * Office formats are missing on purpose. They need either server-side
 * conversion or a heavy library, and neither belongs in the same round as
 * this.
 */

const TEXT_EXT = /^(txt|log|md|markdown|json|xml|yml|yaml|ini|conf|sql)$/
const TEXT_MIME = /^text\/|json|xml|yaml/

/** Beyond this a browser tab stops being pleasant. */
export const MAX_TEXT_BYTES = 2 * 1024 * 1024
export const MAX_TEXT_CHARS = 200000
export const MAX_CSV_ROWS = 2000

function extensionOf(name = ''){
    const clean = String(name).split(/[?#]/)[0]
    const dot = clean.lastIndexOf('.')
    return dot > 0?clean.slice(dot + 1).toLowerCase():''
}

/**
 * `image` | `pdf` | `csv` | `text` | `none`
 *
 * MIME first — that is what the server stored — extension second, because
 * older entries have none and because browsers report Office and CSV files
 * inconsistently.
 */
export function previewKind({mime = '', name = '', url = ''} = {}){
    const type = String(mime).toLowerCase().split(';')[0].trim()
    const ext = extensionOf(name) || extensionOf(url)

    if(type.startsWith('image/')){
        // SVG is an image and also a document that can carry script. The
        // server refuses it on upload; this refuses it again in case that
        // ever changes.
        return ext === 'svg' || type === 'image/svg+xml'?'none':'image'
    }
    if(type === 'application/pdf' || ext === 'pdf') return 'pdf'
    if(type === 'text/csv' || type === 'text/tab-separated-values' || ext === 'csv' || ext === 'tsv') return 'csv'
    if(TEXT_MIME.test(type) || TEXT_EXT.test(ext)) return 'text'
    return 'none'
}

export const canPreview = file => previewKind(file) !== 'none'

/* ------------------------------------------------------------------ csv -- */

/**
 * The separator, guessed from the first line.
 *
 * Guessed and not asked: half the CSV files in a German office are separated
 * by semicolons because that is what Excel writes here, and a file that opens
 * as one long column is useless. Counted outside quotes, so a comma inside a
 * field does not win the vote.
 */
export function sniffDelimiter(sample){
    const line = String(sample || '').split(/\r?\n/, 1)[0] || ''
    let best = ','
    let bestCount = 0
    for(const candidate of [',', ';', '\t', '|']){
        let count = 0
        let inQuotes = false
        for(let i = 0; i < line.length; i++){
            const ch = line[i]
            if(ch === '"') inQuotes = !inQuotes
            else if(ch === candidate && !inQuotes) count++
        }
        if(count > bestCount){
            best = candidate
            bestCount = count
        }
    }
    return best
}

/**
 * CSV to rows.
 *
 * Character by character rather than `split`, because a field may contain the
 * separator, a line break or a quote, and `"` doubled inside a quoted field
 * means one literal quote. Splitting on commas works until the first address
 * with a comma in it and then produces a table that is quietly wrong — worse
 * than one that refuses.
 *
 * Stops after `maxRows` and says so, so a 200.000-line export does not freeze
 * the tab.
 */
export function parseCsv(text, {delimiter = null, maxRows = MAX_CSV_ROWS} = {}){
    const s = String(text || '')
    const sep = delimiter || sniffDelimiter(s)
    const rows = []
    let row = []
    let field = ''
    let inQuotes = false
    let truncated = false

    for(let i = 0; i < s.length; i++){
        const ch = s[i]

        if(inQuotes){
            if(ch === '"'){
                if(s[i + 1] === '"'){
                    field += '"'
                    i++
                } else {
                    inQuotes = false
                }
            } else {
                field += ch
            }
            continue
        }

        if(ch === '"' && field === ''){
            inQuotes = true
        } else if(ch === sep){
            row.push(field)
            field = ''
        } else if(ch === '\n' || ch === '\r'){
            if(ch === '\r' && s[i + 1] === '\n') i++
            row.push(field)
            field = ''
            // A trailing newline must not become an empty last row.
            if(row.length > 1 || row[0] !== '') rows.push(row)
            row = []
            if(rows.length >= maxRows){
                truncated = i < s.length - 1
                break
            }
        } else {
            field += ch
        }
    }

    if(!truncated && (field !== '' || row.length)){
        row.push(field)
        rows.push(row)
    }

    const width = rows.reduce((max, r) => Math.max(max, r.length), 0)
    // Ragged files are normal. Padding here means the table markup does not
    // have to think about missing cells.
    for(const r of rows) while(r.length < width) r.push('')

    return {rows, delimiter: sep, truncated}
}

/* ----------------------------------------------------------------- text -- */

/** Pretty-print JSON, leave anything else alone. */
export function formatText(text, kind){
    const s = String(text || '')
    if(kind !== 'json') return s
    try {
        return JSON.stringify(JSON.parse(s), null, 2)
    } catch {
        // Not valid JSON — showing it raw is more useful than an error, since
        // finding the broken place is usually why it is being opened.
        return s
    }
}
