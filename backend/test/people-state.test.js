/**
 * Accounts and memberships are switched off, not deleted.
 *
 * The half worth testing is the permission half. `board_member` IS the
 * permission source: a row left behind by somebody who was taken off a board
 * is, from the database's point of view, indistinguishable from a member —
 * only the state tells them apart, and every query that forgets it hands
 * somebody back a board they were removed from.
 *
 * The queries themselves live in SQL and cannot be run here. What can be
 * checked is the second lock: board.roles.js refuses an inactive member a role
 * even when one reaches it, so a single forgotten `where` is not on its own
 * enough to open the door.
 */
const test = require('node:test')
const assert = require('node:assert')

const roles = require('../api/board/board.roles')

const FORMER = {_id: 'u_former'}
const CURRENT = {_id: 'u_current'}
const ADMIN = {_id: 'u_admin', isAdmin: true}

const BOARD = {
    _id: 'b1',
    ownerIds: [CURRENT._id],
    members: [
        {_id: CURRENT._id, role: 'owner', state: 'active'},
        {_id: FORMER._id, role: 'editor', state: 'inactive'}
    ]
}

test('somebody who was taken off the board has no role', () => {
    assert.strictEqual(roles.roleOf(BOARD, FORMER), null)
    assert.strictEqual(roles.canView(BOARD, FORMER), false)
    assert.strictEqual(roles.isEditor(BOARD, FORMER), false)
})

test('a member with no state at all is still a member', () => {
    // Every row written before the state existed. Reading a missing value as
    // "not active" would have locked the whole company out on deploy.
    const old = {ownerIds: [], members: [{_id: 'u9', role: 'editor'}]}
    assert.strictEqual(roles.roleOf(old, {_id: 'u9'}), 'editor')
})

test('the ones still on the board are untouched', () => {
    assert.strictEqual(roles.roleOf(BOARD, CURRENT), 'owner')
})

test('an administrator is still an owner everywhere', () => {
    // Checked before the member list is even read, which is why a board they
    // are not on still answers.
    assert.strictEqual(roles.roleOf(BOARD, ADMIN), 'owner')
})

/* ---------------------------------------------------------------- login -- */

/**
 * A closed account cannot sign in, and the login says nothing about why.
 *
 * The login is exercised with a replaced user service, so there is no database
 * and no cookie key involved.
 */
const userServicePath = require.resolve('../api/user/user.service')
const bcrypt = require('bcrypt')

const HASH = bcrypt.hashSync('richtiges-passwort', 4)
let account = {_id: 'u1', username: 'alex', fullname: 'Alex', password: HASH, state: 'active'}

require.cache[userServicePath] = {
    id: userServicePath, filename: userServicePath, loaded: true,
    exports: {getByUsername: async () => ({...account})}
}

const authService = require('../api/auth/auth.service')

test('an open account logs in', async () => {
    account = {...account, state: 'active'}
    const user = await authService.login('alex', 'richtiges-passwort')
    assert.strictEqual(user.username, 'alex')
})

test('a closed account does not', async () => {
    account = {...account, state: 'inactive'}
    await assert.rejects(() => authService.login('alex', 'richtiges-passwort'))
})

test('and it is refused with the same words as a wrong password', async () => {
    // Otherwise the login form answers "does this account still exist?" for
    // anybody who cares to ask.
    account = {...account, state: 'inactive'}
    const closed = await authService.login('alex', 'richtiges-passwort').catch(err => String(err))
    account = {...account, state: 'active'}
    const wrong = await authService.login('alex', 'falsch').catch(err => String(err))
    assert.strictEqual(closed, wrong)
})
