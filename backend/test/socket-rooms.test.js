/**
 * Which rooms one socket holds.
 *
 * HANDOVER §6 for years: a socket was in exactly one room, so opening a task
 * dialog left the board's and every live board update stopped until the dialog
 * was closed again. Nobody reported it, because a board that has quietly
 * stopped moving looks exactly like a board nobody is working on.
 *
 * The rule that matters is the second test. The rest are the ones that would
 * break if somebody "simplified" it back.
 */
const test = require('node:test')
const assert = require('node:assert')
const {
    leaveTask, joinBoardRoom, joinTaskRoom, targetRoom
} = require('../services/socket.service')

/** A socket that only remembers what it was told to join and leave. */
function fakeSocket(){
    const joined = new Set()
    return {
        data: {boardRoom: null, taskRoom: null},
        joined,
        join(room){
            joined.add(room)
        },
        leave(room){
            joined.delete(room)
        }
    }
}

test('joining a board room puts the socket in it', () => {
    const s = fakeSocket()
    assert.strictEqual(joinBoardRoom(s, 'board:b1'), true)
    assert.deepStrictEqual([...s.joined], ['board:b1'])
    assert.strictEqual(s.data.boardRoom, 'board:b1')
})

test('opening a task KEEPS the board room', () => {
    // The whole round in one assertion.
    const s = fakeSocket()
    joinBoardRoom(s, 'board:b1')
    joinTaskRoom(s, 'task:b1:t1')
    assert.deepStrictEqual([...s.joined].sort(), ['board:b1', 'task:b1:t1'])
    assert.strictEqual(s.data.boardRoom, 'board:b1')
    assert.strictEqual(s.data.taskRoom, 'task:b1:t1')
})

test('closing the task keeps the board room', () => {
    const s = fakeSocket()
    joinBoardRoom(s, 'board:b1')
    joinTaskRoom(s, 'task:b1:t1')
    leaveTask(s)
    assert.deepStrictEqual([...s.joined], ['board:b1'])
    assert.strictEqual(s.data.taskRoom, null)
})

test('switching boards drops the dialog with it', () => {
    // A task dialog belonging to the board you just left is not open any more.
    const s = fakeSocket()
    joinBoardRoom(s, 'board:b1')
    joinTaskRoom(s, 'task:b1:t1')
    joinBoardRoom(s, 'board:b2')
    assert.deepStrictEqual([...s.joined], ['board:b2'])
    assert.strictEqual(s.data.taskRoom, null)
})

test('switching from one task to another leaves the first', () => {
    const s = fakeSocket()
    joinBoardRoom(s, 'board:b1')
    joinTaskRoom(s, 'task:b1:t1')
    joinTaskRoom(s, 'task:b1:t2')
    assert.deepStrictEqual([...s.joined].sort(), ['board:b1', 'task:b1:t2'])
})

test('a task with no board room at all is allowed', () => {
    // The calendar's task panel. It never joins a board room, and the old
    // code refused it outright — that dialog had no live updates whatsoever.
    const s = fakeSocket()
    joinTaskRoom(s, 'task:b1:t1')
    assert.deepStrictEqual([...s.joined], ['task:b1:t1'])
    assert.strictEqual(s.data.boardRoom, null)
})

test('re-joining the room already held changes nothing', () => {
    // The client re-emits its topic on every reconnect.
    const s = fakeSocket()
    joinBoardRoom(s, 'board:b1')
    joinTaskRoom(s, 'task:b1:t1')
    assert.strictEqual(joinBoardRoom(s, 'board:b1'), false)
    assert.strictEqual(joinTaskRoom(s, 'task:b1:t1'), false)
    // ...and in particular the board room is not dropped by re-joining it,
    // which would have taken the task room with it.
    assert.deepStrictEqual([...s.joined].sort(), ['board:b1', 'task:b1:t1'])
})

test('leaving the task twice is not a problem', () => {
    const s = fakeSocket()
    joinTaskRoom(s, 'task:b1:t1')
    leaveTask(s)
    leaveTask(s)
    assert.deepStrictEqual([...s.joined], [])
})

test('a message goes to the dialog when one is open, the board otherwise', () => {
    const s = fakeSocket()
    assert.strictEqual(targetRoom(s), null)
    joinBoardRoom(s, 'board:b1')
    assert.strictEqual(targetRoom(s), 'board:b1')
    joinTaskRoom(s, 'task:b1:t1')
    assert.strictEqual(targetRoom(s), 'task:b1:t1')
    leaveTask(s)
    assert.strictEqual(targetRoom(s), 'board:b1')
})
