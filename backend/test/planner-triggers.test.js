/**
 * When the plan redoes itself, and — mostly — when it does not.
 *
 * The decision is the whole feature: a planner that reacts to everything
 * moves people's calendars while they are reading them, and one that reacts
 * to nothing has to be pressed by hand for ever.
 */
const test = require('node:test')
const assert = require('node:assert')

const triggers = require('../api/planner/planner.triggers')

const board = {
    columns: [
        {id: 'c1', type: 'status', field: 'status'},
        {id: 'c2', type: 'priority', field: 'priority'},
        {id: 'c3', type: 'estimate', field: 'c_est'},
        {id: 'c4', type: 'deadline', field: 'c_dl'},
        {id: 'c5', type: 'text', field: 'c_txt'},
        {id: 'c6', type: 'date', field: 'dueDate'}
    ]
}

/* ------------------------------------------------------------ relevant -- */

test('a new deadline is worth replanning', () => {
    assert.strictEqual(triggers.isRelevant(board, {c_dl: 123}), true)
})

test('a new estimate is worth replanning', () => {
    assert.strictEqual(triggers.isRelevant(board, {c_est: 90}), true)
})

test('a new priority is worth replanning', () => {
    assert.strictEqual(triggers.isRelevant(board, {priority: 'p_1'}), true)
})

test('a status change is worth replanning — it may mean finished', () => {
    assert.strictEqual(triggers.isRelevant(board, {status: 'Done'}), true)
})

test('handing a task to somebody else is worth replanning', () => {
    assert.strictEqual(triggers.isRelevant(board, {memberIds: ['u2']}), true)
})

/* --------------------------------------------------------- not relevant -- */

test('a renamed task is not', () => {
    assert.strictEqual(triggers.isRelevant(board, {title: 'Neuer Name'}), false)
})

test('an ordinary date column is not — only the deadline counts', () => {
    // The board has both. Only one of them is what the plan is built on.
    assert.strictEqual(triggers.isRelevant(board, {dueDate: 123}), false)
})

test('a comment is not', () => {
    assert.strictEqual(triggers.isRelevant(board, {comments: [{id: 'c', txt: 'hi'}]}), false)
})

test('a text column is not', () => {
    assert.strictEqual(triggers.isRelevant(board, {c_txt: 'irgendwas'}), false)
})

test('nothing at all is not', () => {
    assert.strictEqual(triggers.isRelevant(board, null), false)
    assert.strictEqual(triggers.isRelevant(board, {}), false)
})

test('a board without columns cannot be relevant by column', () => {
    assert.strictEqual(triggers.isRelevant({}, {status: 'Done'}), false)
    // …but who it belongs to is not a column question.
    assert.strictEqual(triggers.isRelevant({}, {memberIds: ['u1']}), true)
})

/* ----------------------------------------------------------- who moves -- */

test('both the old and the new owner are replanned', () => {
    const users = triggers.affectedUsers({memberIds: ['alt']}, {memberIds: ['neu']})
    assert.deepStrictEqual(users.sort(), ['alt', 'neu'])
})

test('somebody who stays is named once', () => {
    assert.deepStrictEqual(triggers.affectedUsers({memberIds: ['u1']}, {memberIds: ['u1']}), ['u1'])
})

test('a change that does not touch the assignment keeps the current owner', () => {
    assert.deepStrictEqual(triggers.affectedUsers({memberIds: ['u1']}, {status: 'Done'}), ['u1'])
})

test('a task belonging to nobody moves nobody', () => {
    assert.deepStrictEqual(triggers.affectedUsers({}, {}), [])
})
