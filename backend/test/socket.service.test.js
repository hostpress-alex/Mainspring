/**
 * The two pure parts of the real-time layer.
 *
 * readCookie decides who a socket belongs to: it pulls the login token out of
 * the raw Cookie header of the handshake. Getting it wrong in the lenient
 * direction means handing somebody the wrong identity, so the interesting
 * cases here are the near-misses — a cookie whose name merely ends with
 * "loginToken", a value containing "=", a header with odd spacing.
 *
 * boardHasTask decides whether a socket may join a task room.
 */
const test = require('node:test')
const assert = require('node:assert')

const {readCookie, boardHasTask} = require('../services/socket.service')

/* ------------------------------------------------------------ readCookie -- */

test('reads a single cookie', () => {
    assert.strictEqual(readCookie('loginToken=abc123', 'loginToken'), 'abc123')
})

test('finds the cookie among several, whatever its position', () => {
    const header = 'theme=dark; loginToken=abc123; language=de'
    assert.strictEqual(readCookie(header, 'loginToken'), 'abc123')
    assert.strictEqual(readCookie(header, 'theme'), 'dark')
    assert.strictEqual(readCookie(header, 'language'), 'de')
})

test('does not confuse a cookie whose name merely ends the same way', () => {
    // "notTheLoginToken" must not be mistaken for "loginToken".
    assert.strictEqual(readCookie('notTheLoginToken=evil', 'loginToken'), null)
    assert.strictEqual(readCookie('notTheLoginToken=evil; loginToken=real', 'loginToken'), 'real')
})

test('does not match on a prefix either', () => {
    assert.strictEqual(readCookie('loginTokenBackup=evil', 'loginToken'), null)
})

test('survives untidy whitespace', () => {
    assert.strictEqual(readCookie('  theme=dark ;   loginToken=abc123  ', 'loginToken'), 'abc123')
})

test('keeps a value that contains "=" intact', () => {
    // The encrypted token is hex, but base64-ish values with padding are
    // exactly the sort of thing that breaks a naive split('=').
    assert.strictEqual(readCookie('loginToken=YWJjZA==', 'loginToken'), 'YWJjZA==')
})

test('decodes percent-encoding', () => {
    assert.strictEqual(readCookie('loginToken=a%20b', 'loginToken'), 'a b')
})

test('returns the raw value rather than throwing on broken encoding', () => {
    assert.strictEqual(readCookie('loginToken=100%', 'loginToken'), '100%')
})

test('returns null when there is nothing to read', () => {
    assert.strictEqual(readCookie('', 'loginToken'), null)
    assert.strictEqual(readCookie(null, 'loginToken'), null)
    assert.strictEqual(readCookie(undefined, 'loginToken'), null)
    assert.strictEqual(readCookie('theme=dark', 'loginToken'), null)
})

test('an empty cookie value is empty, not missing', () => {
    assert.strictEqual(readCookie('loginToken=', 'loginToken'), '')
})

/* ---------------------------------------------------------- boardHasTask -- */

const board = {
    groups: [
        {id: 'g1', tasks: [{id: 't1'}, {id: 't2'}]},
        {id: 'g2', tasks: [{id: 't3'}]}
    ]
}

test('finds a task in any group', () => {
    assert.strictEqual(boardHasTask(board, 't1'), true)
    assert.strictEqual(boardHasTask(board, 't3'), true)
})

test('does not find a task that belongs to another board', () => {
    assert.strictEqual(boardHasTask(board, 't99'), false)
})

test('compares as text, so a numeric id still matches', () => {
    assert.strictEqual(boardHasTask({groups: [{tasks: [{id: 7}]}]}, '7'), true)
})

test('copes with boards that are missing pieces', () => {
    assert.strictEqual(boardHasTask({}, 't1'), false)
    assert.strictEqual(boardHasTask(null, 't1'), false)
    assert.strictEqual(boardHasTask({groups: []}, 't1'), false)
    assert.strictEqual(boardHasTask({groups: [{id: 'g1'}]}, 't1'), false)
})
