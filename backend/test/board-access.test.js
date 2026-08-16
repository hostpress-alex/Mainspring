/**
 * Who may see a board.
 *
 * hasAccess and isOwner are the whole of the permission model. They are used
 * by the REST layer and, since the socket was locked down, by the real-time
 * layer too — a mistake here does not produce an error message, it produces
 * somebody reading a board they are not part of.
 *
 * These functions are pure, so no database is involved.
 */
const test = require('node:test')
const assert = require('node:assert')

const boardService = require('../api/board/board.service')

const member = id => ({_id: id, fullname: 'Member ' + id})
const user = (id, extra = {}) => ({_id: id, fullname: 'User ' + id, ...extra})

test('an owner listed in ownerIds has access', () => {
    const board = {ownerIds: ['u1'], members: [member('u1')]}
    assert.strictEqual(boardService.hasAccess(board, user('u1')), true)
    assert.strictEqual(boardService.isOwner(board, user('u1')), true)
})

test('a plain member has access but does not own the board', () => {
    const board = {ownerIds: ['u1'], members: [member('u1'), member('u2')]}
    assert.strictEqual(boardService.hasAccess(board, user('u2')), true)
    assert.strictEqual(boardService.isOwner(board, user('u2')), false)
})

test('somebody who is neither owner nor member is kept out', () => {
    const board = {ownerIds: ['u1'], members: [member('u1')]}
    assert.strictEqual(boardService.hasAccess(board, user('stranger')), false)
    assert.strictEqual(boardService.isOwner(board, user('stranger')), false)
})

test('an admin gets in everywhere', () => {
    const board = {ownerIds: ['u1'], members: [member('u1')]}
    assert.strictEqual(boardService.hasAccess(board, user('root', {isAdmin: true})), true)
    assert.strictEqual(boardService.isOwner(board, user('root', {isAdmin: true})), true)
})

test('ids of different types still match', () => {
    // Ids do not always arrive as strings — a caller may hand in a number or an
    // object with a toString. Comparison has to survive that.
    const board = {ownerIds: [{toString: () => 'u1'}], members: []}
    assert.strictEqual(boardService.hasAccess(board, user('u1')), true)
})

test('no user and no board mean no access', () => {
    const board = {ownerIds: ['u1'], members: [member('u1')]}
    assert.strictEqual(boardService.hasAccess(board, null), false)
    assert.strictEqual(boardService.hasAccess(board, undefined), false)
    assert.strictEqual(boardService.hasAccess(null, user('u1')), false)
    assert.strictEqual(boardService.isOwner(null, user('u1')), false)
})

test('an empty user id does not slip through an empty owner list', () => {
    // Guest mode hands out { _id: '' }. That must not accidentally match a
    // board whose owner list contains an empty entry.
    const board = {ownerIds: [], members: []}
    assert.strictEqual(boardService.hasAccess(board, user('')), false)
})

test('a board with neither owners nor members lets nobody in', () => {
    assert.strictEqual(boardService.hasAccess({}, user('u1')), false)
    assert.deepStrictEqual(boardService.ownerIdsOf({}), [])
})
