/**
 * The three roles.
 *
 * `board.roles.js` is pure — no database, no request — which is the point of
 * having it. Every rule in the product can be stated here as a sentence and
 * checked as one.
 *
 * The rules that are easy to get backwards, and are therefore each written out
 * rather than folded into a loop:
 *
 *   - an editor may create a group, and may then change and delete THAT group
 *   - a group nobody can prove they made belongs to the owners
 *   - a viewer may reply but may not open a thread
 *   - a viewer may edit their own comment and nobody else's
 */
const test = require('node:test')
const assert = require('node:assert')

const roles = require('../api/board/board.roles')

const OWNER = {_id: 'u_owner'}
const EDITOR = {_id: 'u_editor'}
const OTHER_EDITOR = {_id: 'u_editor2'}
const VIEWER = {_id: 'u_viewer'}
const STRANGER = {_id: 'u_stranger'}
const ADMIN = {_id: 'u_admin', isAdmin: true}

const BOARD = {
    _id: 'b1',
    ownerIds: [OWNER._id],
    members: [
        {_id: OWNER._id, role: 'owner'},
        {_id: EDITOR._id, role: 'editor'},
        {_id: OTHER_EDITOR._id, role: 'editor'},
        {_id: VIEWER._id, role: 'viewer'}
    ]
}

/* ---------------------------------------------------------------- who -- */

test('every member gets the role they were given', () => {
    assert.strictEqual(roles.roleOf(BOARD, OWNER), 'owner')
    assert.strictEqual(roles.roleOf(BOARD, EDITOR), 'editor')
    assert.strictEqual(roles.roleOf(BOARD, VIEWER), 'viewer')
})

test('somebody who is not on the board has no role', () => {
    assert.strictEqual(roles.roleOf(BOARD, STRANGER), null)
    assert.strictEqual(roles.canView(BOARD, STRANGER), false)
})

test('an administrator counts as an owner everywhere', () => {
    // A decision, not an oversight: an administrator who cannot repair a board
    // is not much of an administrator.
    assert.strictEqual(roles.roleOf(BOARD, ADMIN), 'owner')
})

test('a member with no role at all is an editor', () => {
    // What "member" meant before roles existed. A row that somehow arrives
    // without one must not fall through to the strictest reading and lock
    // somebody out of work they were doing yesterday.
    const board = {ownerIds: [], members: [{_id: 'u9'}]}
    assert.strictEqual(roles.roleOf(board, {_id: 'u9'}), 'editor')
})

test('an owner without a member row still owns the board', () => {
    const board = {ownerIds: ['u9'], members: []}
    assert.strictEqual(roles.roleOf(board, {_id: 'u9'}), 'owner')
})

test('a viewer may see and nothing more', () => {
    assert.strictEqual(roles.canView(BOARD, VIEWER), true)
    assert.strictEqual(roles.isEditor(BOARD, VIEWER), false)
    assert.strictEqual(roles.isOwner(BOARD, VIEWER), false)
})

/* -------------------------------------------------------------- groups -- */

const ownGroup = {id: 'g1', createdBy: EDITOR._id}
const foreignGroup = {id: 'g2', createdBy: OTHER_EDITOR._id}
const orphanGroup = {id: 'g3', createdBy: null}

test('an editor may add a group', () => {
    assert.strictEqual(roles.canAddGroup(BOARD, EDITOR), true)
})

test('a viewer may not add a group', () => {
    assert.strictEqual(roles.canAddGroup(BOARD, VIEWER), false)
})

test('an editor may change the group they created', () => {
    assert.strictEqual(roles.canManageGroup(BOARD, EDITOR, ownGroup), true)
})

test('an editor may not touch somebody else\'s group', () => {
    assert.strictEqual(roles.canManageGroup(BOARD, EDITOR, foreignGroup), false)
})

test('a group with no known creator belongs to the owners', () => {
    // The safe way round for everything the migration could not attribute:
    // handing a right out later is harmless, taking one away is not.
    assert.strictEqual(roles.canManageGroup(BOARD, EDITOR, orphanGroup), false)
    assert.strictEqual(roles.canManageGroup(BOARD, OWNER, orphanGroup), true)
})

test('an owner may change any group', () => {
    for(const group of [ownGroup, foreignGroup, orphanGroup]){
        assert.strictEqual(roles.canManageGroup(BOARD, OWNER, group), true)
    }
})

/* ------------------------------------------------------------ comments -- */

const own = {id: 'c1', parentId: 'c0', byMember: {_id: VIEWER._id}}
const foreign = {id: 'c2', parentId: 'c0', byMember: {_id: EDITOR._id}}
const anonymous = {id: 'c3', parentId: 'c0', byMember: {}}

test('a viewer may write a reply', () => {
    assert.strictEqual(roles.canWriteComment(BOARD, VIEWER, own, {isNew: true}), true)
})

test('a viewer may not open a new thread', () => {
    const update = {id: 'c4', parentId: null, byMember: {_id: VIEWER._id}}
    assert.strictEqual(roles.canWriteComment(BOARD, VIEWER, update, {isNew: true}), false)
})

test('an editor may open a thread', () => {
    const update = {id: 'c4', parentId: null, byMember: {_id: EDITOR._id}}
    assert.strictEqual(roles.canWriteComment(BOARD, EDITOR, update, {isNew: true}), true)
})

test('a viewer may change their own comment', () => {
    assert.strictEqual(roles.canWriteComment(BOARD, VIEWER, own), true)
})

test('a viewer may not change somebody else\'s', () => {
    assert.strictEqual(roles.canWriteComment(BOARD, VIEWER, foreign), false)
})

test('a comment with no author belongs to nobody', () => {
    // Written before users were a concept. Only an owner or an editor may
    // clear those up.
    assert.strictEqual(roles.canWriteComment(BOARD, VIEWER, anonymous), false)
    assert.strictEqual(roles.canWriteComment(BOARD, OWNER, anonymous), true)
})

test('an editor may moderate any comment', () => {
    assert.strictEqual(roles.canWriteComment(BOARD, EDITOR, own), true)
})

test('a stranger may write nothing at all', () => {
    assert.strictEqual(roles.canWriteComment(BOARD, STRANGER, own, {isNew: true}), false)
    assert.strictEqual(roles.canWriteComment(BOARD, STRANGER, own), false)
})
