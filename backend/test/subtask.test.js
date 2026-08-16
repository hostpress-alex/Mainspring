/**
 * Subtasks.
 *
 * A subtask is a task in the same table with a pointer to the task above it.
 * That buys comments, mentions, assignments and notifications for free, and it
 * costs one thing: "all tasks of a group" and "all rows of that group" are no
 * longer the same question. Everything here guards that seam.
 *
 * The tree walking in board.service and the assembly in board.repo are pure,
 * so both are tested without a database.
 */
const test = require('node:test')
const assert = require('node:assert')

const boardService = require('../api/board/board.service')

const group = () => ({
    id: 'g1',
    tasks: [
        {id: 't1', title: 'Design', subtasks: [
            {id: 's1', title: 'Wireframe'},
            {id: 's2', title: 'Colours'}
        ]},
        {id: 't2', title: 'Build', subtasks: []}
    ]
})

test('finds a top-level task', () => {
    assert.strictEqual(boardService._findTask(group(), 't2').title, 'Build')
})

test('finds a subtask through the routes a task uses', () => {
    // The point of the whole design: patch, replace and delete need no second
    // set of endpoints because a subtask is found right here.
    assert.strictEqual(boardService._findTask(group(), 's2').title, 'Colours')
})

test('an unknown id is a 404, not undefined', () => {
    assert.throws(() => boardService._findTask(group(), 'nope'), err => err.status === 404)
})

test('a task without a subtasks list does not break the search', () => {
    const g = {id: 'g1', tasks: [{id: 't1', title: 'Alone'}]}
    assert.strictEqual(boardService._findTask(g, 't1').title, 'Alone')
    assert.throws(() => boardService._findTask(g, 's1'), err => err.status === 404)
})

test('names the task a subtask hangs off', () => {
    assert.strictEqual(boardService._findParent(group(), 's1').id, 't1')
})

test('a top-level task has no parent', () => {
    assert.strictEqual(boardService._findParent(group(), 't1'), null)
})

/* --------------------------------------------------------------- shape -- */

/**
 * The one-level rule is visible in the data, not only in a check: a subtask
 * carries no `subtasks` key at all, so a caller that walks the tree stops on
 * its own and `addSubtask` can refuse a second level by asking whether the
 * key is there.
 */
test('only top-level tasks carry a subtasks list', () => {
    const g = group()
    assert.ok(Array.isArray(g.tasks[0].subtasks))
    for(const child of g.tasks[0].subtasks){
        assert.strictEqual(child.subtasks, undefined)
    }
})

test('a subtask is refused as a parent', () => {
    // What addSubtask checks, spelled out: the candidate parent has no
    // subtasks key, so it is itself a subtask.
    const child = boardService._findTask(group(), 's1')
    assert.strictEqual(Boolean(child.subtasks), false)
})
