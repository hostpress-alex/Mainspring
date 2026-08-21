import DOMPurify from 'dompurify'

/**
 * Rich text: what may be stored, and what may be shown.
 *
 * Comments, updates, the board description and the calendar note hold HTML
 * written by people. That is a stored-XSS hole by default, and the one rule
 * that closes it is here: **cleaning happens on the way OUT, never on the way
 * in.**
 *
 * Cleaning on save sounds tidier and is a trap. It makes every write path
 * responsible for security, so the day somebody adds a fifth place that saves
 * text — an import, a migration, a socket message — the hole is open again and
 * nothing points at it. Cleaning on render means the database may hold
 * anything and the screen still cannot be attacked.
 *
 * The allowlist is deliberately small. It is exactly what the toolbar can
 * produce plus what pasting from Word survives as. No tables, no styles and no
 * classes — a `style` attribute is enough to cover the page with an invisible
 * clickable layer.
 *
 * Images are allowed, but only OUR images. `src` has to point at this
 * application's upload endpoint; anything else loses the tag. An `<img>` with
 * a foreign address is a tracking pixel: it hands the reader's IP address and
 * the moment they opened the comment to whoever wrote it, without asking. The
 * upload path is also the only place a file's type is checked.
 */

const ALLOWED_TAGS = [
    'p', 'br',
    'strong', 'b', 'em', 'i', 'u', 's', 'del',
    'h1', 'h2', 'h3',
    'ul', 'ol', 'li',
    'blockquote', 'code', 'pre', 'hr',
    'a', 'img',
    // The checklist, as tiptap writes it.
    'label', 'input', 'div', 'span'
]

const ALLOWED_ATTR = [
    'href', 'target', 'rel',
    'src', 'alt',
    // Checklist state and the mention, both read back when editing again.
    'type', 'checked', 'disabled', 'loading',
    'data-type', 'data-checked',
    // A mention, in tiptap's own attribute names. Renaming these to something
    // more readable breaks the extension's parser, which is what reads them
    // back when a comment is edited again.
    'data-id', 'data-label', 'data-mention-suggestion-char'
]

/** Protocols a link may use. Everything else loses its href. */
const SAFE_PROTOCOL = /^(?:https?:|mailto:|tel:|#|\/)/i

/**
 * The only address an image may have: a file this application stores.
 *
 * Deliberately the exact shape the upload endpoint hands out and not "anything
 * relative" — a relative path can still be `/api/board/...`, and an `<img>`
 * pointing at an endpoint that changes something is a way to make a reader
 * perform it just by opening the comment.
 */
const OWN_UPLOAD = /^\/api\/upload\/[a-f0-9]{32}$/i

/**
 * What DOMPurify does not do by itself.
 *
 * The protocol check lives HERE and not in `ALLOWED_URI_REGEXP`, and that is
 * not a matter of taste. That option is not applied to URLs — it is applied to
 * every attribute value that is not on DOMPurify's internal list of harmless
 * attribute names. Setting it deleted `data-type="taskList"`, `data-id="u1"`
 * and `checked`, because none of those look like a URL. The result was an
 * editor that saved a mention and read back "@null", and a checklist whose
 * ticks were gone — no error, just quietly emptied attributes. Found by a test
 * that put a comment through the whole loop, not by looking at the screen.
 *
 * The rest is what a project tool wants anyway: links open in a new tab, and
 * always with `rel=noopener`, or the opened page can navigate the one it came
 * from through `window.opener`.
 */
let isHooked = false
function ensureHooks(){
    if(isHooked) return
    DOMPurify.addHook('afterSanitizeAttributes', node => {
        if(node.tagName === 'A' && node.hasAttribute('href')){
            const href = node.getAttribute('href').replace(/[\u0000-\u0020]/g, '')
            if(!SAFE_PROTOCOL.test(href)){
                node.removeAttribute('href')
            } else {
                node.setAttribute('target', '_blank')
                node.setAttribute('rel', 'noopener noreferrer nofollow')
            }
        }
        if(node.tagName === 'IMG'){
            const src = (node.getAttribute('src') || '').replace(/[\u0000-\u0020]/g, '')
            // The whole tag goes, not just the src: an <img> without one draws
            // a broken-image icon and says nothing about why.
            if(!OWN_UPLOAD.test(src)) node.remove()
            else node.setAttribute('loading', 'lazy')
        }
        // A checkbox in a stored comment is a picture of a state, not a
        // control. Editing happens in the editor, where tiptap owns it.
        if(node.tagName === 'INPUT'){
            node.setAttribute('disabled', 'disabled')
            node.removeAttribute('name')
        }
    })
    isHooked = true
}

/** Clean HTML, ready for dangerouslySetInnerHTML — and only ever from here. */
export function sanitize(html){
    ensureHooks()
    return DOMPurify.sanitize(String(html || ''), {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        // Left at the default on purpose — see the hook above for why
        // narrowing it is a trap. `data-` attributes are listed one by one in
        // ALLOWED_ATTR rather than opened up wholesale.
        ALLOW_DATA_ATTR: false
    })
}

/* --------------------------------------------------------- old content -- */

const MENTION_TOKEN = /@\[([^\]\n]+)\]\(([^)\s]+)\)/g

/**
 * Does a stored value already look like HTML?
 *
 * Built from ALLOWED_TAGS rather than typed out a second time. It used to be
 * its own hand-written list, and it had drifted: `img`, `label`, `input` and
 * `del` were in the allowlist and missing here. The consequence was not a
 * missing tag but a visible one — an update whose content began with an
 * `<img>` (a pasted screenshot, which is the ONLY thing in it) failed this
 * test, was taken for old plain text, and got escaped. The reader then saw
 * `<img src="/api/upload/…">` printed as words, in the editor and on the
 * screen, and typing one character afterwards saved it that way.
 *
 * Longest first, so `blockquote` is not matched as `b` followed by a word
 * boundary that is not there.
 *
 * The heuristic keeps its known failure: a plain-text comment that literally
 * contains "<p>" is treated as HTML and cleaned, so the reader sees the tag
 * gone rather than printed. That is the trade for needing no migration of
 * every row that is fine.
 */
const HTML_LIKE = new RegExp(
    `<(?:${[...ALLOWED_TAGS].sort((a, b) => b.length - a.length).join('|')})\\b`, 'i')

function escapeHtml(text){
    return String(text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

/**
 * Text written before the editor existed, as HTML.
 *
 * Every comment in the database today is plain text with `@[Name](id)` tokens
 * and line breaks. Rather than migrate them — which would mean rewriting rows
 * that are fine and getting one wrong — they are lifted on the way to the
 * screen. A stored value is HTML if it looks like HTML; anything else is old.
 *
 * That test is a heuristic, and the failure it can have is worth naming: a
 * plain-text comment that literally contains "<p>" is treated as HTML and then
 * cleaned, so the reader sees the tag gone rather than printed. Against that:
 * every real comment keeps working with no migration at all.
 */
export function fromLegacy(text){
    const s = String(text || '')
    if(!s.trim()) return ''
    if(HTML_LIKE.test(s)) return s

    const withMentions = escapeHtml(s).replace(MENTION_TOKEN,
        (_, name, id) => `<span data-type="mention" data-id="${escapeHtml(id)}" data-label="${escapeHtml(name)}">@${escapeHtml(name)}</span>`)

    return withMentions
        .split(/\n{2,}/)
        .map(block => `<p>${block.replace(/\n/g, '<br>')}</p>`)
        .join('')
}

/**
 * Drop the empty paragraphs a document ends with.
 *
 * ProseMirror keeps a trailing empty paragraph so there is always somewhere to
 * put the cursor below the last block. That is right in the editor and wrong
 * in the database: every comment would carry a `<p></p>` and every one of them
 * is a blank line under the text when it is read back.
 *
 * Only at the END. An empty paragraph in the middle is a blank line somebody
 * typed on purpose.
 */
export function trimTrailingEmpty(html){
    let out = String(html || '')
    let before
    do {
        before = out
        out = out.replace(/(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>)+$/i, '')
    } while(out !== before)
    return out
}

/** Stored value -> what may be put on screen. The only path to the DOM. */
export function toDisplayHtml(value){
    return sanitize(fromLegacy(value))
}

/* ------------------------------------------------------------- reading -- */

/**
 * The readable text inside, for notification previews, search and the
 * "empty?" question.
 *
 * Through the DOM rather than a regular expression over the markup: stripping
 * tags with a regex turns `a <b>b` into something different than the browser
 * shows, and it is the classic way to reintroduce the hole the sanitizer just
 * closed.
 */
export function toPlainText(value){
    const html = fromLegacy(value)
    if(!html) return ''
    if(typeof document === 'undefined') return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

    const holder = document.createElement('div')
    holder.innerHTML = sanitize(html)
    // Block ends become spaces, or "one<p>two" reads as "onetwo".
    for(const el of holder.querySelectorAll('p, div, li, br, h1, h2, h3, blockquote, pre')){
        el.insertAdjacentText('afterend', ' ')
    }
    return (holder.textContent || '').replace(/\s+/g, ' ').trim()
}

/**
 * Is there anything in here?
 *
 * An "empty" tiptap document is `<p></p>`, and a comment box that has been
 * clicked into and left again must not be postable. Asked through the text, so
 * a document holding only a horizontal rule or an empty checklist still counts
 * as empty — which is what a reader would say too.
 */
export function isEmpty(value){
    const html = fromLegacy(value)
    if(!html.trim()) return true
    if(/<(img|hr|input)\b/i.test(html)) return false
    return toPlainText(html).length === 0
}

/** The ids mentioned in a stored value, each once. */
export function mentionedIds(value){
    const html = fromLegacy(value)
    const ids = new Set()

    // The stored form of a mention, in both shapes: the node the editor writes
    // and the token older comments carry.
    for(const match of html.matchAll(/data-type="mention"[^>]*?data-id="([^"]+)"/g)) ids.add(match[1])
    for(const match of String(value || '').matchAll(MENTION_TOKEN)) ids.add(match[2])
    return [...ids]
}

/* ------------------------------------------------------------ checklist -- */

/** The one shape tiptap writes for a checklist item. */
const TASK_ITEM = 'li[data-type="taskItem"]'

/** Does this text contain a checklist at all? */
export function hasTaskItems(value){
    return /data-type=("|')taskItem\1/.test(String(value || ''))
}

/**
 * Give the checkboxes of a checklist back their teeth.
 *
 * The sanitizer disables every input it lets through, on every path, and that
 * stays the default — see the hook in `ensureHooks`. This undoes it for one
 * case, on already-cleaned markup, and only for the boxes that belong to a
 * checklist item.
 *
 * Done to the STRING before it is put on screen rather than to the elements
 * afterwards. The first attempt enabled them in an effect once the markup was
 * in the DOM, and it worked until React re-rendered the surrounding dialog:
 * the innerHTML was written again from the same string, the boxes came back
 * disabled, and the effect did not run because nothing it depends on had
 * changed. A property set on a node React owns is a property React can take
 * away again at any moment.
 */
export function enableTaskBoxes(html){
    const text = String(html || '')
    if(!hasTaskItems(text)) return text
    const doc = new DOMParser().parseFromString(`<body>${text}</body>`, 'text/html')
    doc.body.querySelectorAll(`${TASK_ITEM} input[type="checkbox"]`).forEach(box => {
        box.removeAttribute('disabled')
    })
    return doc.body.innerHTML
}

/**
 * Tick or untick the nth item of a checklist, and give back the whole text.
 *
 * Works on the STORED markup rather than on what is on screen, and identifies
 * the item by its position among the checklist items. Two alternatives were
 * considered and are worse:
 *
 *   - An id per item would have to be written by the editor, be preserved
 *     through every edit, and be migrated onto the checklists that already
 *     exist. Position is stable for exactly as long as it needs to be: the
 *     click happens on markup that was rendered from this same string.
 *   - Editing the DOM that is on screen and reading it back would hand
 *     whatever the browser made of it — including anything a future feature
 *     adds to that node — straight back into the database.
 *
 * Returns null when there is nothing at that position, so a caller cannot
 * save a change that did not happen. Otherwise the new text, the item's own
 * words and its new state — the last two because the history should be able
 * to say *which* box was ticked rather than printing the whole update again.
 */
export function toggleTaskItem(value, index){
    const html = String(value || '')
    if(!hasTaskItems(html)) return null

    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
    const items = doc.body.querySelectorAll(TASK_ITEM)
    const item = items[index]
    if(!item) return null

    const wasChecked = item.getAttribute('data-checked') === 'true'
    item.setAttribute('data-checked', wasChecked?'false':'true')

    // The attribute is what tiptap reads back when the comment is edited
    // again; the input is what a reader sees. Both, or the two disagree the
    // moment somebody opens the editor.
    const box = item.querySelector('input[type="checkbox"]')
    if(box){
        if(wasChecked) box.removeAttribute('checked')
        else box.setAttribute('checked', 'checked')
    }

    // The words of the item without its own checkbox: the label holds the
    // control, the div next to it holds the text.
    const body = item.querySelector('div') || item
    const label = String(body.textContent || '').replace(/\s+/g, ' ').trim()

    return {html: doc.body.innerHTML, label, isChecked: !wasChecked}
}
