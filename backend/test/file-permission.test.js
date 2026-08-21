/**
 * Who may read an uploaded file.
 *
 * There was no test for this, although the commit that added `file.board_id`
 * said there was. There was also no check: the controller looked the file up
 * by id and streamed it, so any signed-in person holding an id could fetch any
 * file. The column, the frontend parameter and three documents all described a
 * permission that the two lines needed to enforce it were missing from.
 *
 * `board.repo` is replaced through the module cache, so no database is
 * involved. What is asserted is the decision, not the plumbing around it.
 */
const test = require('node:test')
const assert = require('node:assert')

const boardRepoPath = require.resolve('../api/board/board.repo')

/** Who is on which board. Everything else is not a member. */
const MEMBERS = {b_one: ['u_member'], b_two: ['u_other']}
let isMemberCalls = 0

require.cache[boardRepoPath] = {
    id: boardRepoPath,
    filename: boardRepoPath,
    loaded: true,
    exports: {
        async isMember(boardId, userId){
            isMemberCalls++
            return (MEMBERS[boardId] || []).includes(String(userId))
        }
    }
}

const {mayRead} = require('../api/upload/upload.controller')

const file = boardId => ({_id: 'f1', boardId, mime: 'image/png', size: 1})
const user = (id, isAdmin = false) => ({_id: id, isAdmin})

test('a member of the board may read the file', async () => {
    assert.strictEqual(await mayRead(file('b_one'), user('u_member')), true)
})

test('somebody on another board may not, even holding the id', async () => {
    // The id is 32 random hex characters. That stops guessing and does nothing
    // about a URL that was noted down or forwarded.
    assert.strictEqual(await mayRead(file('b_one'), user('u_other')), false)
})

test('somebody on no board at all may not', async () => {
    assert.strictEqual(await mayRead(file('b_one'), user('u_stranger')), false)
})

test('a file that belongs to no board stays open to anybody signed in', async () => {
    // Profile pictures live in the same table. An avatar only its owner can
    // see is not an avatar.
    assert.strictEqual(await mayRead(file(null), user('u_stranger')), true)
    assert.strictEqual(await mayRead(file(undefined), user('u_stranger')), true)
})

test('an admin may read any file', async () => {
    assert.strictEqual(await mayRead(file('b_one'), user('u_stranger', true)), true)
})

test('nobody signed in may not read a file that belongs to a board', async () => {
    assert.strictEqual(await mayRead(file('b_one'), null), false)
})

test('the board is asked once, not by assembling the board', async () => {
    // Every image in a comment is one of these calls. A full board read per
    // image is the reason isMember exists as one indexed row.
    const before = isMemberCalls
    await mayRead(file('b_one'), user('u_member'))
    assert.strictEqual(isMemberCalls - before, 1)
})

test('a file with no board does not ask at all', async () => {
    const before = isMemberCalls
    await mayRead(file(null), user('u_stranger'))
    assert.strictEqual(isMemberCalls - before, 0)
})
