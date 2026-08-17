/**
 * The rights come from the database, the identity from the cookie.
 *
 * This is the defect this file was written for: the login cookie carries
 * `isAdmin` and the whole user record, and nothing used to look any further.
 * Switching an account off therefore did nothing until the person closed their
 * browser, and taking somebody's admin rights away did nothing either.
 */
const test = require('node:test')
const assert = require('node:assert')

const userServicePath = require.resolve('../api/user/user.service')

let account = {_id: 'u1', fullname: 'Alex', isAdmin: false, state: 'active'}
let reads = 0

require.cache[userServicePath] = {
    id: userServicePath, filename: userServicePath, loaded: true,
    exports: {
        getById: async () => {
            reads++
            return account?{...account}:null
        }
    }
}

const accountService = require('../services/account.service')

test('a switched-off account is nobody', async () => {
    account = {_id: 'u1', fullname: 'Alex', isAdmin: false, state: 'inactive'}
    accountService.forget('u1')
    assert.strictEqual(await accountService.currentUser('u1'), null)
})

test('an account that no longer exists is nobody', async () => {
    account = null
    accountService.forget('u1')
    assert.strictEqual(await accountService.currentUser('u1'), null)
})

test('the admin flag comes from the row, not from the cookie', async () => {
    account = {_id: 'u1', fullname: 'Alex', isAdmin: true, state: 'active'}
    accountService.forget('u1')
    const user = await accountService.currentUser('u1')
    assert.strictEqual(user.isAdmin, true)

    // Taken away in the database, with the cookie unchanged.
    account = {...account, isAdmin: false}
    accountService.forget('u1')
    assert.strictEqual((await accountService.currentUser('u1')).isAdmin, false)
})

test('the answer is reused rather than read per request', async () => {
    account = {_id: 'u1', fullname: 'Alex', isAdmin: false, state: 'active'}
    accountService.forget('u1')
    reads = 0
    await accountService.currentUser('u1')
    await accountService.currentUser('u1')
    await accountService.currentUser('u1')
    assert.strictEqual(reads, 1, 'three requests, one lookup')
})

test('forgetting makes the next request read again', async () => {
    // What the administration calls when it switches an account off, so nobody
    // has to wait the ten seconds out.
    accountService.forget('u1')
    reads = 0
    await accountService.currentUser('u1')
    assert.strictEqual(reads, 1)
})

/* ---------------------------------------------------------------------------
 * The three tests that were here checked `isRevoked` — a date on the user
 * compared against a timestamp in the token. That was the shape of revocation
 * while there was nothing to delete. Sessions are rows now, so signing out is
 * a DELETE and the question those tests asked cannot be asked any more. See
 * session-store.test.js.
 * ------------------------------------------------------------------------ */

test('a database that is away is an error, not a logout', async () => {
    // Answering "not authenticated" would sign the whole company out for ten
    // seconds over a hiccup.
    require.cache[userServicePath].exports.getById = async () => {
        throw new Error('connect ECONNREFUSED')
    }
    accountService.forget('u1')
    await assert.rejects(() => accountService.currentUser('u1'))
})
