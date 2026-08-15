/**
 * The login rate limit.
 *
 * Two failure modes matter and they pull in opposite directions. Too loose and
 * it does not slow an attacker down at all; too tight and one person with caps
 * lock on locks out the office, because a whole company shares one address.
 * The tests below pin both ends.
 *
 * Time is passed in rather than read from the clock, so none of this sleeps.
 */
const test = require('node:test')
const assert = require('node:assert')

const throttle = require('../services/login-throttle.service')
const {WINDOW_MS, MAX_PER_ACCOUNT, MAX_PER_ADDRESS} = throttle

const T0 = 1_700_000_000_000

test.beforeEach(() => throttle.reset())

test('a fresh address may try', () => {
    assert.strictEqual(throttle.check('1.1.1.1', 'alex', T0).allowed, true)
})

test('a few wrong passwords are still fine', () => {
    for(let i = 0; i < MAX_PER_ACCOUNT - 1; i++) throttle.recordFailure('1.1.1.1', 'alex', T0)
    assert.strictEqual(throttle.check('1.1.1.1', 'alex', T0).allowed, true)
})

test('the account is blocked once the limit is reached', () => {
    for(let i = 0; i < MAX_PER_ACCOUNT; i++) throttle.recordFailure('1.1.1.1', 'alex', T0)

    const verdict = throttle.check('1.1.1.1', 'alex', T0)
    assert.strictEqual(verdict.allowed, false)
    assert.ok(verdict.retryAfter > 0, 'a blocked answer has to say for how long')
    assert.ok(verdict.retryAfter <= WINDOW_MS / 1000)
})

test('the block expires', () => {
    for(let i = 0; i < MAX_PER_ACCOUNT; i++) throttle.recordFailure('1.1.1.1', 'alex', T0)

    assert.strictEqual(throttle.check('1.1.1.1', 'alex', T0 + WINDOW_MS - 1).allowed, false)
    assert.strictEqual(throttle.check('1.1.1.1', 'alex', T0 + WINDOW_MS).allowed, true)
})

test('the time left shrinks as the window runs out', () => {
    for(let i = 0; i < MAX_PER_ACCOUNT; i++) throttle.recordFailure('1.1.1.1', 'alex', T0)

    const early = throttle.check('1.1.1.1', 'alex', T0 + 1000).retryAfter
    const late = throttle.check('1.1.1.1', 'alex', T0 + 60_000).retryAfter
    assert.ok(late < early, `expected ${late} to be less than ${early}`)
})

test('blocking one account leaves the others alone', () => {
    for(let i = 0; i < MAX_PER_ACCOUNT; i++) throttle.recordFailure('1.1.1.1', 'alex', T0)

    assert.strictEqual(throttle.check('1.1.1.1', 'alex', T0).allowed, false)
    assert.strictEqual(throttle.check('1.1.1.1', 'sascha', T0).allowed, true)
})

test('another address is not affected', () => {
    for(let i = 0; i < MAX_PER_ACCOUNT; i++) throttle.recordFailure('1.1.1.1', 'alex', T0)

    assert.strictEqual(throttle.check('2.2.2.2', 'alex', T0).allowed, true)
})

test('spraying many usernames from one address is caught by the second counter', () => {
    // Every username is fresh, so the per-account counter never fires. This is
    // exactly the attack the per-address counter exists for.
    for(let i = 0; i < MAX_PER_ADDRESS; i++){
        throttle.recordFailure('3.3.3.3', `user${i}`, T0)
    }
    assert.strictEqual(throttle.check('3.3.3.3', 'someone-new', T0).allowed, false)
})

test('a correct password clears that account', () => {
    for(let i = 0; i < MAX_PER_ACCOUNT; i++) throttle.recordFailure('1.1.1.1', 'alex', T0)
    assert.strictEqual(throttle.check('1.1.1.1', 'alex', T0).allowed, false)

    throttle.recordSuccess('1.1.1.1', 'alex')
    assert.strictEqual(throttle.check('1.1.1.1', 'alex', T0).allowed, true)
})

test('a correct password does not clear the address counter', () => {
    // Otherwise guessing thirty accounts and then logging into your own would
    // hand the attacker a clean slate.
    for(let i = 0; i < MAX_PER_ADDRESS; i++) throttle.recordFailure('4.4.4.4', `user${i}`, T0)
    throttle.recordSuccess('4.4.4.4', 'user0')

    assert.strictEqual(throttle.check('4.4.4.4', 'anyone', T0).allowed, false)
})

test('usernames are compared without regard to case', () => {
    for(let i = 0; i < MAX_PER_ACCOUNT; i++) throttle.recordFailure('1.1.1.1', 'Alex', T0)
    assert.strictEqual(throttle.check('1.1.1.1', 'alex', T0).allowed, false)
    assert.strictEqual(throttle.check('1.1.1.1', 'ALEX', T0).allowed, false)
})

test('a missing username does not throw', () => {
    throttle.recordFailure('1.1.1.1', undefined, T0)
    throttle.recordFailure('1.1.1.1', null, T0)
    assert.strictEqual(throttle.check('1.1.1.1', undefined, T0).allowed, true)
})

test('failures spread over time never add up to a block', () => {
    // One wrong password every twenty minutes is a forgetful colleague, not an
    // attack. The window has to actually reset.
    for(let i = 0; i < 50; i++){
        const at = T0 + i * (WINDOW_MS + 1)
        throttle.recordFailure('1.1.1.1', 'alex', at)
        assert.strictEqual(throttle.check('1.1.1.1', 'alex', at).allowed, true, `blocked on attempt ${i}`)
    }
})
