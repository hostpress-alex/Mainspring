/**
 * The global search.
 *
 * Five kinds of thing, one query each, all of them scoped to what the person
 * asking may see — see search.repo.js, where that rule lives.
 *
 * The only real work here is the updates. They are stored as HTML, so a
 * search for "p" matches every `<p>` and a search for "span" matches every
 * mention. Two steps rather than one clever one:
 *
 *   1. the database narrows the field with a LIKE over the raw text — cheap,
 *      and wrong in one direction only (it lets too much through)
 *   2. this file strips the tags and checks that the term is still there
 *
 * A regular expression is enough for the stripping because the result never
 * goes back into a page: it is a preview, rendered as text by React. The same
 * reasoning is written out in notification.service.js.
 */
const asyncLocalStorage = require('../../services/als.service')
const logger = require('../../services/logger.service')
const searchRepo = require('./search.repo')

/** Below this a search matches half the database and helps nobody. */
const MIN_TERM = 2

const TYPES = ['boards', 'tasks', 'updates', 'files', 'people']

function getLoggedinUser(){
    const store = asyncLocalStorage.getStore()
    return (store && store.loggedinUser) || null
}

function httpError(status, msg){
    const err = new Error(msg)
    err.status = status
    return err
}

/** Tags out, entities back to characters, runs of space to one. */
function toPlain(html){
    return String(html || '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim()
}

/**
 * A window of text around the first hit.
 *
 * Showing the first eighty characters of an update would, for a long one,
 * show eighty characters that do not contain what was searched for — and then
 * the result looks like a mistake.
 */
function excerpt(text, term, span = 90){
    const at = text.toLowerCase().indexOf(term.toLowerCase())
    if(at < 0) return text.slice(0, span)
    const from = Math.max(0, at - Math.floor(span / 3))
    const cut = text.slice(from, from + span)
    return (from > 0?'…':'') + cut + (from + span < text.length?'…':'')
}

/**
 * Search everything, or one kind of thing.
 *
 * Returns the same shape either way, with the kinds that were not asked for
 * left empty — so the client renders one component and not five.
 */
async function search(term, {type = 'all'} = {}){
    const user = getLoggedinUser()
    if(!user) throw httpError(401, 'Nicht angemeldet')

    const clean = String(term || '').trim()
    const empty = {term: clean, boards: [], tasks: [], updates: [], files: [], people: []}
    if(clean.length < MIN_TERM) return empty
    if(type !== 'all' && !TYPES.includes(type)) throw httpError(400, 'Unbekannter Suchbereich')

    const wanted = type === 'all'?TYPES:[type]
    const out = {...empty}

    try {
        await Promise.all(wanted.map(async kind => {
            if(kind === 'updates'){
                const rows = await searchRepo.updates(user, clean)
                out.updates = rows
                    .map(row => ({...row, text: toPlain(row.txt)}))
                    // Only what really matched, once the markup is gone.
                    .filter(row => row.text.toLowerCase().includes(clean.toLowerCase()))
                    .slice(0, searchRepo.PER_TYPE)
                    .map(({txt, text, ...rest}) => ({...rest, preview: excerpt(text, clean)}))
                return
            }
            out[kind] = await searchRepo[kind](user, clean)
        }))
    } catch(err) {
        logger.error(`search failed for "${clean}"`, err)
        throw err
    }

    return out
}

module.exports = {search, MIN_TERM, TYPES, toPlain, excerpt}
