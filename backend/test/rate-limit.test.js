/**
 * The ceiling on how fast one caller may ask.
 *
 * A fixed window, deliberately: it lets through up to twice the limit across a
 * boundary, which for a script meant to write a few dozen rows nobody can
 * measure, and the simpler rule is the one that stays correct when somebody
 * edits it in a year. The tests say so out loud so that the property is not
 * later "fixed" by accident.
 */
const test = require('node:test')
const assert = require('node:assert')
const {createLimiter} = require('../services/rate-limit.service')
const {bearerOf} = require('../middlewares/setupAls.middleware')

test('lets the first requests through and then stops', () => {
    const limiter = createLimiter({limit: 3, windowMs: 60000})
    assert.strictEqual(limiter.take('a').ok, true)
    assert.strictEqual(limiter.take('a').ok, true)
    assert.strictEqual(limiter.take('a').ok, true)
    assert.strictEqual(limiter.take('a').ok, false)
})

test('counts each caller on its own', () => {
    const limiter = createLimiter({limit: 1, windowMs: 60000})
    assert.strictEqual(limiter.take('a').ok, true)
    assert.strictEqual(limiter.take('b').ok, true)
    assert.strictEqual(limiter.take('a').ok, false)
})

test('a refused call is not counted', () => {
    // Otherwise a caller that keeps hammering pushes its own window further
    // out and locks itself out for longer than the rule says.
    const limiter = createLimiter({limit: 1, windowMs: 60000})
    limiter.take('a')
    const first = limiter.take('a').retryAfterMs
    const second = limiter.take('a').retryAfterMs
    assert.ok(second <= first)
})

test('says how long to wait, in a form a program can use', () => {
    const limiter = createLimiter({limit: 1, windowMs: 1000})
    limiter.take('a')
    const verdict = limiter.take('a')
    assert.strictEqual(verdict.ok, false)
    assert.ok(verdict.retryAfterMs > 0 && verdict.retryAfterMs <= 1000)
})

test('the window opens again', async () => {
    const limiter = createLimiter({limit: 1, windowMs: 20})
    assert.strictEqual(limiter.take('a').ok, true)
    assert.strictEqual(limiter.take('a').ok, false)
    await new Promise(r => setTimeout(r, 30))
    assert.strictEqual(limiter.take('a').ok, true)
})

test('reports what is left', () => {
    const limiter = createLimiter({limit: 2, windowMs: 60000})
    assert.strictEqual(limiter.take('a').remaining, 1)
    assert.strictEqual(limiter.take('a').remaining, 0)
})

/* ------------------------------------------------------ reading the key -- */

test('the bearer is read from the header and nowhere else', () => {
    assert.strictEqual(bearerOf({headers: {authorization: 'Bearer msp_abc'}}), 'msp_abc')
    assert.strictEqual(bearerOf({headers: {authorization: 'bearer msp_abc'}}), 'msp_abc')
    assert.strictEqual(bearerOf({headers: {authorization: 'Bearer   msp_abc  '}}), 'msp_abc')
})

test('anything that is not a bearer is not one', () => {
    assert.strictEqual(bearerOf({headers: {}}), null)
    assert.strictEqual(bearerOf({headers: {authorization: 'Basic abc'}}), null)
    assert.strictEqual(bearerOf({headers: {authorization: 'Bearer'}}), null)
    assert.strictEqual(bearerOf({headers: {authorization: 'Bearer '}}), null)
    assert.strictEqual(bearerOf({}), null)
})
