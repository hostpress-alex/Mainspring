/**
 * Turning stored text back into markup.
 *
 * The one direction where being generous re-opens the hole the sanitizer
 * exists to close, so the rule in `20260821_000033_unescape_images.js` is
 * narrow on purpose and these cases are what keeps it narrow. The failures
 * matter more than the successes here: everything that is not exactly one of
 * our own uploads has to come back untouched.
 */
const test = require('node:test')
const assert = require('node:assert')

const {unescapeImages} = require('../db/migrations/20260821_000033_unescape_images.js')

const ID = '8'.repeat(32)
const ID2 = '7'.repeat(32)

test('the real case: everything escaped, alt included', () => {
    assert.strictEqual(
        unescapeImages(`&lt;img src=&quot;/api/upload/${ID}&quot; alt=&quot;image.png&quot;&gt;`),
        `<img src="/api/upload/${ID}" alt="image.png">`)
})

test('only the angle brackets escaped', () => {
    assert.strictEqual(
        unescapeImages(`&lt;img src="/api/upload/${ID}" alt="a.png"&gt;`),
        `<img src="/api/upload/${ID}" alt="a.png">`)
})

test('inside a paragraph, with no alt', () => {
    assert.strictEqual(
        unescapeImages(`<p>&lt;img src="/api/upload/${ID}"&gt;</p>`),
        `<p><img src="/api/upload/${ID}"></p>`)
})

test('self-closing', () => {
    assert.strictEqual(
        unescapeImages(`&lt;img src="/api/upload/${ID}" /&gt;`),
        `<img src="/api/upload/${ID}">`)
})

test('two images in one value are two separate matches', () => {
    assert.strictEqual(
        unescapeImages(`&lt;img src="/api/upload/${ID}"&gt; and &lt;img src="/api/upload/${ID2}"&gt;`),
        `<img src="/api/upload/${ID}"> and <img src="/api/upload/${ID2}">`)
})

test('a value that is already fine is returned byte for byte', () => {
    const html = `<p>fine</p><img src="/api/upload/${ID}">`
    assert.strictEqual(unescapeImages(html), html)
})

/* -------------------------------------------------- and now the refusals -- */

test('a foreign address stays text', () => {
    // The whole reason images are allowed at all is that they are ours. An
    // escaped tracking pixel must not be handed a way back in.
    const html = '&lt;img src="https://evil.example/x.gif"&gt;'
    assert.strictEqual(unescapeImages(html), html)
})

test('an address that only looks like ours stays text', () => {
    for(const src of ['/api/upload/nothex', '/api/uploads/' + ID, '/api/upload/' + ID + 'x', '//evil/api/upload/' + ID]){
        const html = `&lt;img src="${src}"&gt;`
        assert.strictEqual(unescapeImages(html), html, src)
    }
})

test('any attribute other than alt stays text', () => {
    const html = `&lt;img src="/api/upload/${ID}" onerror="x"&gt;`
    assert.strictEqual(unescapeImages(html), html)
})

test('an alt carrying entities is not guessed at', () => {
    // Left for a person to look at rather than half-repaired.
    const html = `&lt;img src="/api/upload/${ID}" alt="a&lt;script&gt;b"&gt;`
    assert.strictEqual(unescapeImages(html), html)
})

test('prose about an img tag stays prose', () => {
    const html = 'I meant &lt;img&gt; as a tag'
    assert.strictEqual(unescapeImages(html), html)
})
