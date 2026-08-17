/**
 * How long a login is good for, and how it is taken away.
 *
 * Two things that did not exist: the token carried no time at all, so a copy
 * of the value worked forever; and `logout` cleared the cookie in one browser
 * and nothing else, so there was no way to end a session somebody else was
 * holding.
 */
const test = require('node:test')
const assert = require('node:assert')

// The service builds its key on first use and warns in development. No
// database and no cookie are involved in any of this.
const authService = require('../api/auth/auth.service')

const ALEX = {_id: 'u1', fullname: 'Alex', isAdmin: false}

test('a fresh token reads back', () => {
    const info = authService.validateToken(authService.getLoginToken(ALEX))
    assert.strictEqual(info._id, 'u1')
    assert.ok(Number.isFinite(info.iat), 'and it says when it was issued')
})

test('a token past its age is refused', () => {
    // Built by hand with an old `iat`, which is exactly what a copy kept
    // somewhere for a month would look like.
    const old = Date.now() - authService.TOKEN_MAX_AGE_MS - 1000
    const token = authService.getLoginToken(ALEX)
    const info = authService.validateToken(token)
    assert.ok(info, 'the fresh one is fine')

    const forged = fakeToken({...ALEX, iat: old})
    assert.strictEqual(authService.validateToken(forged), null)
})

test('a token from before this existed is refused', () => {
    // Every token issued by the old code has no `iat`. Treating that as
    // "issued now" would keep exactly the tokens this was written against.
    const legacy = fakeToken({_id: 'u1', fullname: 'Alex', isAdmin: false})
    assert.strictEqual(authService.validateToken(legacy), null)
})

test('an admin flag in a token is not a promise', () => {
    // It is still written, and requireAuth overwrites it with the row. The
    // test is here so that a later reader does not take the field as the
    // source of truth.
    const info = authService.validateToken(authService.getLoginToken({...ALEX, isAdmin: true}))
    assert.strictEqual(info.isAdmin, true, 'it is in the token')
    // ... and the rights come from account.service — see account-freshness.test.js
})

test('rubbish is refused rather than thrown', () => {
    assert.strictEqual(authService.validateToken('not-a-token'), null)
    assert.strictEqual(authService.validateToken(''), null)
    assert.strictEqual(authService.validateToken(undefined), null)
})

/**
 * A token as the service itself would write it, with the payload we choose.
 * Encrypting through getLoginToken would stamp the current time over it.
 */
function fakeToken(payload){
    const Cryptr = require('cryptr')
    const cryptr = new Cryptr('insecure-development-key-do-not-use-in-production')
    return cryptr.encrypt(JSON.stringify(payload))
}
