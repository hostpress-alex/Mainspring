import {describe, it, expect} from 'vitest'
import {
    readTaskParams, withTaskParams, withoutTaskParams, findTaskInBoard, UNKNOWN_GROUP
} from '../services/task-link'

const params = obj => new URLSearchParams(obj)

const board = {
    _id: 'b101',
    groups: [
        {id: 'g1', tasks: [{id: 't1', title: 'Erste'}, {id: 't2', title: 'Zweite', subtasks: [{id: 's1', title: 'Unter'}]}]},
        {id: 'g2', tasks: [{id: 't3', title: 'Dritte'}]}
    ]
}

describe('readTaskParams — what the address asks for', () => {
    it('reads all three', () => {
        expect(readTaskParams(params({board: 'b101', group: 'g1', task: 't1'})))
            .toEqual({boardId: 'b101', groupId: 'g1', taskId: 't1'})
    })

    it('refuses a half-written link', () => {
        // Two out of three would mean opening "some task on that board",
        // which is a guess.
        expect(readTaskParams(params({board: 'b101', task: 't1'}))).toBe(null)
        expect(readTaskParams(params({group: 'g1', task: 't1'}))).toBe(null)
        expect(readTaskParams(params({board: 'b101', group: 'g1'}))).toBe(null)
    })

    it('is quiet on a page with no task in the address', () => {
        expect(readTaskParams(params({view: 'week'}))).toBe(null)
        expect(readTaskParams(null)).toBe(null)
    })
})

describe('withTaskParams / withoutTaskParams — opening and closing', () => {
    it('keeps everything else on the address', () => {
        // The whole point of the query form: the page underneath does not
        // lose its own state because a task was opened on top of it.
        const next = withTaskParams(params({view: 'week', q: 'relaunch'}),
            {boardId: 'b101', groupId: 'g1', taskId: 't1'})
        expect(next.get('view')).toBe('week')
        expect(next.get('q')).toBe('relaunch')
        expect(next.get('task')).toBe('t1')
    })

    it('falls back to the placeholder group', () => {
        const next = withTaskParams(params({}), {boardId: 'b101', taskId: 't1'})
        expect(next.get('group')).toBe(UNKNOWN_GROUP)
    })

    it('takes only the three back out again', () => {
        const open = withTaskParams(params({view: 'week'}), {boardId: 'b101', groupId: 'g1', taskId: 't1'})
        const closed = withoutTaskParams(open)
        expect(closed.toString()).toBe('view=week')
        expect(readTaskParams(closed)).toBe(null)
    })

    it('leaves nothing behind when there was nothing else', () => {
        const open = withTaskParams(params({}), {boardId: 'b101', groupId: 'g1', taskId: 't1'})
        expect(withoutTaskParams(open).toString()).toBe('')
    })

    it('does not change the object it was given', () => {
        const before = params({view: 'week'})
        withTaskParams(before, {boardId: 'b101', groupId: 'g1', taskId: 't1'})
        expect(before.toString()).toBe('view=week')
    })
})

describe('findTaskInBoard — the group is a hint, not the answer', () => {
    it('finds a task in the group it was told', () => {
        expect(findTaskInBoard(board, 'g1', 't1')).toEqual({task: board.groups[0].tasks[0], groupId: 'g1'})
    })

    it('finds it anyway when the link names the wrong group', () => {
        // A notification written this morning carries the group the task was
        // in then. Moving it since must not kill the link.
        expect(findTaskInBoard(board, 'g1', 't3').groupId).toBe('g2')
    })

    it('finds it with no group at all', () => {
        expect(findTaskInBoard(board, UNKNOWN_GROUP, 't3').groupId).toBe('g2')
    })

    it('reports the group a subtask really sits in', () => {
        // The panel writes through the group it gets back, and a write into
        // the wrong group is worse than not opening.
        const found = findTaskInBoard(board, 'g2', 's1')
        expect(found.task.title).toBe('Unter')
        expect(found.groupId).toBe('g1')
    })

    it('answers null for a task that is not there', () => {
        expect(findTaskInBoard(board, 'g1', 'gone')).toBe(null)
    })

    it('survives an empty or missing board', () => {
        expect(findTaskInBoard(null, 'g1', 't1')).toBe(null)
        expect(findTaskInBoard({}, 'g1', 't1')).toBe(null)
        expect(findTaskInBoard(board, 'g1', null)).toBe(null)
    })
})
