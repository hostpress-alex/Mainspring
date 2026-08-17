/**
 * The bin and the archive.
 *
 * Two halves, and the second one is unusual enough to explain.
 *
 * The first is the permission question: who may throw away, who may put back,
 * who may empty. Same shape as board-permissions.test.js — a replaced repo and
 * a replaced login, no database.
 *
 * The second reads the source of two functions. That is not a habit worth
 * spreading, and it is here because the failure it guards against cannot be
 * reached any other way from a machine without MariaDB: `syncGroupTasks` and
 * `syncSubtasks` delete every task that is not in the list the client sent,
 * and a task in the bin is never in that list. Without a filter on `state`
 * they delete it for good — at an unpredictable moment, days after it was
 * thrown away, with nothing in any log. A test that reads for the filter is a
 * poor substitute for a test that stores a task, bins it, saves the group and
 * looks; it is not a substitute for nothing.
 */
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')

const repoPath = require.resolve('../api/board/board.repo')
const alsPath = require.resolve('../services/als.service')

const OWNER = {_id: 'u_owner', fullname: 'Owner'}
const EDITOR = {_id: 'u_editor', fullname: 'Editor'}
const VIEWER = {_id: 'u_viewer', fullname: 'Viewer'}

const BOARD_ID = '0123456789abcdef01234567'

const BOARD = () => ({
    _id: BOARD_ID,
    title: 'Board',
    state: 'active',
    members: [
        {_id: OWNER._id, role: 'owner'},
        {_id: EDITOR._id, role: 'editor'},
        {_id: VIEWER._id, role: 'viewer'}
    ],
    ownerIds: [OWNER._id],
    columns: [],
    groups: [{id: 'g1', title: 'Konzept', createdBy: EDITOR._id, tasks: [{id: 't1', title: 'Task', subtasks: []}]}],
    activities: []
})

let currentUser = OWNER
const calls = []

require.cache[alsPath] = {
    id: alsPath, filename: alsPath, loaded: true,
    exports: {getStore: () => ({loggedinUser: currentUser})}
}

const repoStub = new Proxy({
    ACTIVE: 'active', ARCHIVED: 'archived', TRASHED: 'trashed',
    STATES: ['active', 'archived', 'trashed'],
    findById: async () => BOARD(),
    // The group the editor created, and one they did not.
    findGroupRow: async (boardId, groupId) => (groupId === 'g1'
        ?{id: 'g1', title: 'Konzept', createdBy: EDITOR._id, state: 'active'}
        :{id: groupId, title: 'Fremd', createdBy: OWNER._id, state: 'active'}),
    findTaskRow: async (boardId, taskId) => ({id: taskId, title: 'Task', groupId: 'g1', state: 'active'}),
    findBin: async () => ({groups: [], tasks: []}),
    findBoardsByState: async () => []
}, {
    get(target, key){
        if(key in target) return target[key]
        return async (...args) => {
            calls.push(String(key))
            return args[0]
        }
    }
})

require.cache[repoPath] = {id: repoPath, filename: repoPath, loaded: true, exports: repoStub}

const boardService = require('../api/board/board.service')

async function refused(user, fn){
    currentUser = user
    try {
        await fn()
        return false
    } catch(err) {
        return err.status === 403
    }
}

/* --------------------------------------------------------- throwing away -- */

test('an editor may throw a task away and put it back', async () => {
    assert.strictEqual(await refused(EDITOR,
        () => boardService.setTaskState(BOARD_ID, 't1', 'trashed')), false)
    assert.strictEqual(await refused(EDITOR,
        () => boardService.setTaskState(BOARD_ID, 't1', 'active')), false)
})

test('a viewer may not throw a task away', async () => {
    assert.strictEqual(await refused(VIEWER,
        () => boardService.setTaskState(BOARD_ID, 't1', 'trashed')), true)
})

test('an editor may bin the group they created and not another', async () => {
    assert.strictEqual(await refused(EDITOR,
        () => boardService.setGroupState(BOARD_ID, 'g1', 'archived')), false)
    assert.strictEqual(await refused(EDITOR,
        () => boardService.setGroupState(BOARD_ID, 'g9', 'archived')), true)
})

test('only an owner may bin the board itself', async () => {
    assert.strictEqual(await refused(EDITOR,
        () => boardService.setBoardState(BOARD_ID, 'trashed')), true)
    assert.strictEqual(await refused(OWNER,
        () => boardService.setBoardState(BOARD_ID, 'trashed')), false)
})

test('an unknown state is refused rather than stored', async () => {
    currentUser = OWNER
    await assert.rejects(() => boardService.setBoardState(BOARD_ID, 'geloescht'),
        err => err.status === 400)
})

/* ---------------------------------------------------------- emptying it -- */

test('emptying is owner-only, whatever the thing is', async () => {
    // Nothing here can be undone, so it does not follow the "same right as
    // throwing away" rule that restoring does.
    for(const run of [
        () => boardService.purgeTask(BOARD_ID, 't1'),
        () => boardService.purgeGroup(BOARD_ID, 'g1'),
        () => boardService.purgeBoard(BOARD_ID)
    ]){
        assert.strictEqual(await refused(EDITOR, run), true)
        assert.strictEqual(await refused(OWNER, run), false)
    }
})

/* ------------------------------------------------------- a binned board -- */

test('a board in the bin cannot be worked on', async () => {
    // Reaching it at all would mean a link from before it was thrown away
    // still opens a board that is supposed to be gone.
    const binned = {...BOARD(), state: 'trashed'}
    repoStub.findById = async () => binned
    currentUser = OWNER
    await assert.rejects(() => boardService.addGroup(BOARD_ID, {id: 'g2', title: 'Neu'}),
        err => err.status === 410)

    // ... but putting it back has to work, and so does looking into its bin.
    assert.strictEqual(await refused(OWNER,
        () => boardService.setBoardState(BOARD_ID, 'active')), false)
    assert.strictEqual(await refused(OWNER,
        () => boardService.bin(BOARD_ID, 'trashed')), false)

    repoStub.findById = async () => BOARD()
})

/* ------------------------------------------- the one that eats the bin -- */

test('the two delete-and-rewrite paths leave binned rows alone', () => {
    // See the note at the top of this file for why this is read rather than
    // run. Both of these decide what to DELETE from what the client sent, and
    // a binned row is never in what the client sent.
    const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'board', 'board.repo.js'), 'utf8')

    for(const name of ['syncGroupTasks', 'syncSubtasks']){
        const start = source.indexOf(`async function ${name}(`)
        assert.ok(start > -1, `${name} still exists`)
        const body = source.slice(start, source.indexOf('\n}', start))
        const select = body.slice(body.indexOf('const existing'), body.indexOf('.select('))
        assert.match(select, /state:\s*ACTIVE/,
            `${name} must only consider active rows when working out what to delete`)
    }
})
