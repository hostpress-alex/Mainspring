import {describe, it, expect} from 'vitest'
import {fromLegacy, toDisplayHtml, isEmpty} from '../services/rich-text'

/**
 * Is a stored value HTML, or is it old plain text?
 *
 * `fromLegacy` answers that with a regex over the tag names, and getting the
 * answer wrong is not a missing tag — it is a VISIBLE one. A value taken for
 * plain text is escaped, so `<img src="/api/upload/…">` is printed as words,
 * in the editor and on the screen alike, and typing one character afterwards
 * saves it that way.
 *
 * That is exactly what happened: the list was written out by hand next to
 * ALLOWED_TAGS and drifted from it — `img`, `label`, `input` and `del` were
 * allowed and not recognised. A pasted screenshot is an update whose entire
 * content is one `<img>`, so it hit the gap every single time.
 *
 * The regex is built from ALLOWED_TAGS now. These cases are what stops the two
 * from separating again.
 */
const ID = 'a'.repeat(32)
const IMG = `<img src="/api/upload/${ID}" alt="screenshot.png">`

describe('a pasted image', () => {
    it('is recognised as HTML rather than escaped', () => {
        expect(fromLegacy(IMG)).toBe(IMG)
    })

    it('reaches the screen as an image, not as its own source', () => {
        const html = toDisplayHtml(IMG)
        expect(html).not.toContain('&lt;img')
        expect(html).toContain(`/api/upload/${ID}`)
    })

    it('is not an empty update', () => {
        expect(isEmpty(IMG)).toBe(false)
    })

    it('survives next to text', () => {
        expect(toDisplayHtml(`<p>look</p>${IMG}`)).toContain('<img')
    })
})

describe('the tags that had drifted out of the list', () => {
    for(const [tag, html] of [
        ['del', '<del>gone</del>'],
        ['label', '<label>done</label>'],
        ['input', '<input type="checkbox" checked>']
    ]){
        it(`recognises <${tag}>`, () => {
            expect(fromLegacy(html)).toBe(html)
        })
    }
})

describe('what must not change', () => {
    it('still wraps old plain text in a paragraph', () => {
        expect(fromLegacy('just words')).toBe('<p>just words</p>')
    })

    it('still turns a blank line into a second paragraph', () => {
        expect(fromLegacy('one\n\ntwo')).toBe('<p>one</p><p>two</p>')
    })

    it('still refuses a foreign image', () => {
        // The whole point of allowing images at all: ours only. A foreign one
        // is a tracking pixel that hands over the reader's address.
        expect(toDisplayHtml('<img src="https://evil.example/x.gif">')).not.toContain('<img')
    })

    it('still treats an empty document as empty', () => {
        expect(isEmpty('<p></p>')).toBe(true)
    })
})
