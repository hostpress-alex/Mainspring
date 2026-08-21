import {describe, it, expect} from 'vitest'
import {estimatesFromBoards, progressOf, taskKey} from '../services/task-progress'

const board = {
    _id: 'b1',
    columns: [
        {id: 'c_est', type: 'estimate', field: 'c_est'},
        {id: 'c_txt', type: 'text', field: 'c_txt'}
    ],
    groups: [{id: 'g1', tasks: [
        {id: 't1', c_est: 120},
        {id: 't2'},
        {id: 't3', c_est: 0},
        {id: 't4', c_est: 'viel'}
    ]}]
}

describe('estimatesFromBoards', () => {
    it('reads the estimate column', () => {
        expect(estimatesFromBoards([board])[taskKey('b1', 't1')]).toBe(120)
    })

    it('leaves a task without an estimate out entirely', () => {
        // Not zero. "No estimate" and "estimated at nothing" are different
        // answers and only one of them may draw a full ring.
        const map = estimatesFromBoards([board])
        expect(taskKey('b1', 't2') in map).toBe(false)
        expect(taskKey('b1', 't3') in map).toBe(false)
        expect(taskKey('b1', 't4') in map).toBe(false)
    })

    it('ignores a board with no estimate column', () => {
        const plain = {_id: 'b2', columns: [{id: 'c1', type: 'text', field: 'c1'}],
            groups: [{id: 'g', tasks: [{id: 'x', c1: 'hallo'}]}]}
        expect(estimatesFromBoards([plain])).toEqual({})
    })

    it('keys by board and task, not by task alone', () => {
        // Task ids are only unique within their board, and the calendar is the
        // one place where two boards' tasks sit in the same list.
        const other = {...board, _id: 'b9', groups: [{id: 'g', tasks: [{id: 't1', c_est: 30}]}]}
        const map = estimatesFromBoards([board, other])
        expect(map[taskKey('b1', 't1')]).toBe(120)
        expect(map[taskKey('b9', 't1')]).toBe(30)
    })

    it('survives boards that are barely there', () => {
        expect(estimatesFromBoards([])).toEqual({})
        expect(estimatesFromBoards([{_id: 'b'}])).toEqual({})
        expect(estimatesFromBoards()).toEqual({})
    })
})

describe('progressOf — minutes on one side, milliseconds on the other', () => {
    it('fills half a two-hour estimate with one hour', () => {
        const p = progressOf({spentMs: 60 * 60000, estimateMinutes: 120})
        expect(p.fill).toBeCloseTo(0.5)
        expect(p.isOver).toBe(false)
    })

    it('says nothing when no time has been recorded', () => {
        // An empty ring on every block is noise.
        expect(progressOf({spentMs: 0, estimateMinutes: 120})).toBe(null)
        expect(progressOf({spentMs: undefined, estimateMinutes: 120})).toBe(null)
    })

    it('gives the number and no ratio when there is no estimate', () => {
        const p = progressOf({spentMs: 90 * 60000})
        expect(p.spentMs).toBe(90 * 60000)
        expect(p.fill).toBe(null)
    })

    it('caps at full and marks it as over', () => {
        const p = progressOf({spentMs: 10 * 60 * 60000, estimateMinutes: 60})
        expect(p.fill).toBe(1)
        expect(p.isOver).toBe(true)
    })

    it('is not over when it lands exactly on the estimate', () => {
        const p = progressOf({spentMs: 60 * 60000, estimateMinutes: 60})
        expect(p.fill).toBe(1)
        expect(p.isOver).toBe(false)
    })

    it('does not read a nonsense estimate as a denominator', () => {
        expect(progressOf({spentMs: 60000, estimateMinutes: 'zwei'}).fill).toBe(null)
        expect(progressOf({spentMs: 60000, estimateMinutes: -30}).fill).toBe(null)
    })
})
