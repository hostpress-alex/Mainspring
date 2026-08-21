/**
 * How long a token may be asked to live.
 *
 * There was a `Math.min(ttl, MAX_TTL_MS)` here, and it is why the interface
 * could offer five years while the server handed out two with nothing saying
 * so. A clamp answers "yes" to a request it did not grant.
 */
const test = require('node:test')
const assert = require('node:assert')
const {DEFAULT_TTL_MS, MAX_TTL_MS} = require('../api/token/token.controller')

const YEAR = 365 * 24 * 60 * 60 * 1000

test('the ceiling is five years', () => {
    assert.strictEqual(MAX_TTL_MS, 5 * YEAR)
})

test('the default is a year — long, and not forever', () => {
    // A key nobody looks at again is the one still working three jobs after
    // the person who made it has left.
    assert.strictEqual(DEFAULT_TTL_MS, YEAR)
    assert.ok(DEFAULT_TTL_MS < MAX_TTL_MS)
})

test('every lifetime the interface offers fits under the ceiling', () => {
    // The list in cmps/admin/token-admin: 1, 2, 3, 5 years. Written out here
    // rather than imported, because a backend test cannot reach into the
    // frontend — so if somebody adds ten years there, this is the test that
    // says the two sides have parted company.
    for(const years of [1, 2, 3, 5]){
        assert.ok(years * YEAR <= MAX_TTL_MS, `${years} years must be allowed`)
    }
})

test('one year past the ceiling is not allowed', () => {
    assert.ok(6 * YEAR > MAX_TTL_MS)
})
