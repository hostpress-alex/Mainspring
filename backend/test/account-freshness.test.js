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

/* ----------------------------------------------------------- revocation -- */

test('a token from before the line is refused', () => {
    const user = {_id: 'u1', sessionsValidFrom: 5000}
    assert.strictEqual(accountService.isRevoked(user, 4999), true)
    assert.strictEqual(accountService.isRevoked(user, 5000), false, 'the one issued at that moment stands')
    assert.strictEqual(accountService.isRevoked(user, 6000), false)
})

test('an account that has never revoked anything refuses nothing', () => {
    // Every account today. Reading a missing line as "everything is revoked"
    // would sign the whole company out on deploy.
    assert.strictEqual(accountService.isRevoked({_id: 'u1'}, 1), false)
    assert.strictEqual(accountService.isRevoked({_id: 'u1', sessionsValidFrom: null}, 1), false)
})

test('a token with no issue time is refused once a line exists', () => {
    // The tokens from before the age check. Exactly the ones that would
    // otherwise have been valid forever.
    assert.strictEqual(accountService.isRevoked({sessionsValidFrom: 5000}, undefined), true)
})

test('a database that is away is an error, not a logout', async () => {
    // Answering "not authenticated" would sign the whole company out for ten
    // seconds over a hiccup.
    require.cache[userServicePath].exports.getById = async () => {
        throw new Error('connect ECONNREFUSED')
    }
    accountService.forget('u1')
    await assert.rejects(() => accountService.currentUser('u1'))
})
