/**
 * Which files a task still points at.
 *
 * These cases are the contract between two copies of the same logic —
 * `api/board/task-files.js` and `frontend/src/services/task-files.js`. The
 * server refuses a delete on the strength of this answer, so a wrong "not
 * referenced" here means a file that is still on screen somewhere disappears.
 */
const test = require('node:test')
const assert = require('node:assert')

const {sourcesOf, referencedIds, isReferenced, idOf, idsInText} = require('../api/board/task-files')

const A = 'a'.repeat(32)
const B = 'b'.repeat(32)
const C = 'c'.repeat(32)
const url = id => `/api/upload/${id}`

test('an attachment under an update counts', () => {
    const found = sourcesOf({comments: [{id: 'c1', attachments: [{_id: A, url: url(A)}]}]})
    assert.deepStrictEqual([...found.keys()], [A])
    assert.deepStrictEqual(found.get(A), [{kind: 'attachment', commentId: 'c1'}])
})

test('an image inside the text of an update counts', () => {
    const html = `<p>see <img src="${url(B)}"> here</p>`
    const found = sourcesOf({comments: [{id: 'c2', txt: html}]})
    assert.deepStrictEqual(found.get(B), [{kind: 'text', commentId: 'c2'}])
})

test('a file column counts, and says which column', () => {
    const found = sourcesOf({colValues: {f_1: {url: url(C), name: 'offer.pdf'}}, fileFields: ['f_1']})
    assert.deepStrictEqual(found.get(C), [{kind: 'column', field: 'f_1'}])
})

test('a column value that is a bare url still counts', () => {
    // The file column stored nothing but a string before it learned about
    // names and sizes. Those values are still in the database.
    const found = sourcesOf({colValues: {f_1: url(C)}, fileFields: ['f_1']})
    assert.ok(found.has(C))
})

test('the same file in two places is one entry with two sources', () => {
    const found = sourcesOf({
        comments: [
            {id: 'c1', txt: `<img src="${url(A)}">`},
            {id: 'c2', attachments: [{_id: A}]}
        ]
    })
    assert.strictEqual(found.size, 1)
    assert.deepStrictEqual(found.get(A), [
        {kind: 'text', commentId: 'c1'},
        {kind: 'attachment', commentId: 'c2'}
    ])
})

test('a file nothing points at is not in the answer', () => {
    assert.strictEqual(referencedIds({comments: [{id: 'c1', txt: 'plain words'}]}).size, 0)
    assert.strictEqual(isReferenced({}, A), false)
})

test('a column that is not a file column is not read', () => {
    // fileFields is what makes this safe: a text column whose value happens to
    // be an upload URL is not a file attached to the task.
    const found = sourcesOf({colValues: {text_1: url(A)}, fileFields: []})
    assert.strictEqual(found.size, 0)
})

test('a long hex string in the text pins nothing', () => {
    // Anchored on the route, not on "32 hex characters anywhere".
    const found = sourcesOf({comments: [{id: 'c1', txt: `<p>${A}</p>`}]})
    assert.strictEqual(found.size, 0)
})

test('several images in one update all count', () => {
    assert.deepStrictEqual(idsInText(`<img src="${url(A)}"><img src="${url(B)}">`), [A, B])
})

test('the id is read case-insensitively and answered in lower case', () => {
    assert.strictEqual(idOf(url(A.toUpperCase())), A)
    assert.strictEqual(idOf(A.toUpperCase()), A)
})

test('nothing, null and rubbish are simply not references', () => {
    for(const value of [null, undefined, '', 0, {}, {url: ''}, {url: '/api/upload/nope'}, [], 'hello']){
        assert.strictEqual(idOf(value), null, `idOf(${JSON.stringify(value)})`)
    }
    assert.deepStrictEqual(idsInText(null), [])
    assert.deepStrictEqual(idsInText(42), [])
})

test('a second call is not affected by the first', () => {
    // The regex is a module-level /g, and a /g regex keeps lastIndex between
    // calls. Without a reset the second read starts in the middle of nowhere
    // and finds nothing — which would show as a file being unreferenced only
    // sometimes.
    const html = `<img src="${url(A)}">`
    assert.deepStrictEqual(idsInText(html), [A])
    assert.deepStrictEqual(idsInText(html), [A])
    assert.strictEqual(idOf(url(B)), B)
    assert.strictEqual(idOf(url(B)), B)
})
