/**
 * Who may change what on a board.
 *
 * The rule is "an owner owns the structure": renaming the board, its columns
 * and everything about groups. Members work on tasks.
 *
 * These are worth a test rather than a careful read because the failure is
 * silent in the direction that matters — a check that is missing does not
 * throw, it simply lets the write through, and nothing in the application
 * looks any different until somebody notices their board was renamed.
 *
 * The service is exercised through a replaced repo and a replaced login, so
 * no database is involved.
 */
const test = require('node:test')
const assert = require('node:assert')

const repoPath = require.resolve('../api/board/board.repo')
const alsPath = require.resolve('../services/als.service')

const OWNER = {_id: 'u_owner', fullname: 'Owner'}
const MEMBER = {_id: 'u_member', fullname: 'Member'}

const BOARD = () => ({
    _id: '0123456789abcdef01234567',
    title: 'Board',
    members: [{_id: OWNER._id}, {_id: MEMBER._id}],
    ownerIds: [OWNER._id],
    columns: [{id: 'c1', type: 'status', title: 'Status', field: 'status'}],
    groups: [{
        id: 'g1', title: 'Konzept', color: '#fff', icon: '',
        tasks: [{id: 't1', title: 'Task', subtasks: []}]
    }],
    activities: []
})

let currentUser = OWNER
const calls = []

require.cache[alsPath] = {
    id: alsPath, filename: alsPath, loaded: true,
    exports: {getStore: () => ({loggedinUser: currentUser})}
}

const repoStub = new Proxy({
    findById: async () => BOARD()
}, {
    get(target, key){
        if(key in target) return target[key]
        // Every write is recorded and does nothing. A test that reaches here
        // has already passed the permission check, which is the whole question.
        return async (...args) => {
            calls.push(String(key))
            return args[0]
        }
    }
})

require.cache[repoPath] = {id: repoPath, filename: repoPath, loaded: true, exports: repoStub}

const boardService = require('../api/board/board.service')

const BOARD_ID = BOARD()._id

/**
 * Run `fn` as this user and say whether it was refused with 403.
 *
 * Anything else that goes wrong counts as "not refused", and that is the point
 * rather than sloppiness: these calls carry on past the permission check into
 * reading the board back and writing notifications, which want a database. The
 * question here is only whether the door opened. A test that also needed the
 * rest to work would be a test of three things at once, and the one that
 * matters — a missing check does not throw, it lets the write through — would
 * be the easiest of the three to lose.
 */
async function refused(user, fn){
    currentUser = user
    try {
        await fn()
        return false
    } catch(err) {
        return err.status === 403
    }
}

const STRUCTURE = {
    'rename the board':   () => boardService.updateMeta(BOARD_ID, {title: 'Neu'}),
    'change the columns': () => boardService.setColumns(BOARD_ID, []),
    // Adding a group moved to the editor when the roles arrived — see the
    // role tests. Deleting and renaming somebody else's group did not.
    'delete a group':     () => boardService.removeGroup(BOARD_ID, 'g1'),
    'rename a group':     () => boardService.updateGroupMeta(BOARD_ID, 'g1', {title: 'Anders'}),
    'reorder groups':     () => boardService.reorderGroups(BOARD_ID, ['g1'])
}

for(const [what, run] of Object.entries(STRUCTURE)){
    test(`a member may not ${what}`, async () => {
        assert.strictEqual(await refused(MEMBER, run), true)
    })
    test(`an owner may ${what}`, async () => {
        assert.strictEqual(await refused(OWNER, run), false)
    })
}

const TASK_WORK = {
    'add a task':      () => boardService.addTask(BOARD_ID, 'g1', {id: 't2', title: 'Neu'}),
    'change a task':   () => boardService.updateTaskFields(BOARD_ID, 'g1', 't1', {status: 'x'}),
    'delete a task':   () => boardService.removeTask(BOARD_ID, 'g1', 't1'),
    'add a subtask':   () => boardService.addSubtask(BOARD_ID, 'g1', 't1', {id: 's1', title: 'Sub'}),
    'reorder tasks':   () => boardService.reorderTasks(BOARD_ID, 'g1', ['t1'])
}

for(const [what, run] of Object.entries(TASK_WORK)){
    test(`a member may ${what}`, async () => {
        assert.strictEqual(await refused(MEMBER, run), false)
    })
}

/* ------------------------------------------------- the conditional one -- */

/**
 * replaceGroup is the one route where the answer depends on the payload,
 * because the frontend falls back to it for task changes it cannot express
 * as a smaller write. Plain owner-only would have shut members out of
 * ordinary work through a back door.
 */
test('a member may write a group whose head is unchanged', async () => {
    assert.strictEqual(await refused(MEMBER, () => boardService.replaceGroup(BOARD_ID, 'g1', {
        id: 'g1', title: 'Konzept', color: '#fff', icon: '',
        tasks: [{id: 't1', title: 'Task'}, {id: 't2', title: 'Noch einer'}]
    })), false)
})

test('a member may not rename a group through replaceGroup', async () => {
    assert.strictEqual(await refused(MEMBER, () => boardService.replaceGroup(BOARD_ID, 'g1', {
        id: 'g1', title: 'Umbenannt', color: '#fff', icon: '',
        tasks: [{id: 't1', title: 'Task'}]
    })), true)
})

test('a member may not recolour a group through replaceGroup', async () => {
    assert.strictEqual(await refused(MEMBER, () => boardService.replaceGroup(BOARD_ID, 'g1', {
        id: 'g1', title: 'Konzept', color: '#e2445c', icon: '',
        tasks: [{id: 't1', title: 'Task'}]
    })), true)
})

test('an owner may do both', async () => {
    assert.strictEqual(await refused(OWNER, () => boardService.replaceGroup(BOARD_ID, 'g1', {
        id: 'g1', title: 'Umbenannt', color: '#e2445c', icon: '🚀',
        tasks: [{id: 't1', title: 'Task'}]
    })), false)
})

/* ----------------------------------------------------------- outsiders -- */

test('somebody who is not on the board gets nowhere at all', async () => {
    const stranger = {_id: 'u_stranger', fullname: 'Fremd'}
    currentUser = stranger
    await assert.rejects(() => boardService.updateTaskFields(BOARD_ID, 'g1', 't1', {status: 'x'}),
        err => err.status === 403)
})
