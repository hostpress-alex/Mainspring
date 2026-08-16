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
const HTML_LIKE = /<(p|div|ul|ol|li|h[1-3]|blockquote|pre|strong|em|s|u|b|i|a|br|hr|span|code)\b/i

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
