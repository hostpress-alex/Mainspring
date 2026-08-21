/**
 * The guard this project has got wrong four times.
 *
 * `Number(null)` is 0 and 0 is finite, so `Number.isFinite(Number(value))`
 * accepts null, undefined and '' and turns a missing timestamp into 1 January
 * 1970. Every nullable timestamp column in this schema uses NULL for "we do
 * not know" — a manufactured epoch is a different statement, and one that
 * cannot be told from a real date afterwards.
 *
 * The four: the comment author repair (round 27), the API token expiry (33),
 * the relative-time formatter (35), and eleven sites in board.repo (35).
 */
const test = require('node:test')
const assert = require('node:assert')
const {msOrNull} = require('../db/knex')

test('nothing is not the epoch', () => {
    assert.strictEqual(msOrNull(null), null)
    assert.strictEqual(msOrNull(undefined), null)
    assert.strictEqual(msOrNull(''), null)
})

test('and neither is nonsense', () => {
    assert.strictEqual(msOrNull('irgendwas'), null)
    assert.strictEqual(msOrNull(NaN), null)
    assert.strictEqual(msOrNull(Infinity), null)
    assert.strictEqual(msOrNull({}), null)
    assert.strictEqual(msOrNull([1, 2]), null)
    assert.strictEqual(msOrNull(new Date('kaputt')), null)
})

test('the epoch itself IS a moment', () => {
    // 0 has to survive: it is a real timestamp, and refusing it would be the
    // same class of mistake in the other direction.
    assert.strictEqual(msOrNull(0), 0)
    assert.strictEqual(msOrNull('0'), 0)
})

test('a moment comes through however it arrived', () => {
    assert.strictEqual(msOrNull(1787000000000), 1787000000000)
    assert.strictEqual(msOrNull('1787000000000'), 1787000000000)
    assert.strictEqual(msOrNull(new Date(1787000000000)), 1787000000000)
})

test('a moment before the epoch is still a moment', () => {
    assert.strictEqual(msOrNull(-86400000), -86400000)
})

test('the ?? fallback in the callers only fires on null', () => {
    // Two places read "absent means now": the appended comment and an
    // activity. `?? Date.now()` is only correct because msOrNull answers null
    // rather than 0 — with the old guard the fallback never fired and the row
    // was dated 1970 instead.
    assert.strictEqual(msOrNull(null) ?? 'now', 'now')
    assert.strictEqual(msOrNull(0) ?? 'now', 0, 'a real epoch must NOT be replaced')
})
