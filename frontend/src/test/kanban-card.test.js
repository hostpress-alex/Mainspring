import {describe, it, expect} from 'vitest'
import {cardColumns, isOnCard, toggledCardColumns, hasCardChoice} from '../services/kanban-card'

/**
 * Which columns a Kanban card shows.
 *
 * The rule has two halves and the second one is where it would go wrong: a
 * board that has never chosen falls back to a default, and the first time
 * anybody flips a single column that default has to be FROZEN rather than
 * dropped. Otherwise switching one column on silently removes the other two,
 * which reads as the click having done something else entirely.
 */
const board = () => ({columns: [
    {id: 'c1', type: 'person', title: 'Person'},
    {id: 'c2', type: 'status', title: 'Status'},
    {id: 'c3', type: 'text', title: 'Note'},
    {id: 'c4', type: 'deadline', title: 'Deadline'},
    {id: 'c5', type: 'priority', title: 'Priority'}
]})
const ids = list => list.map(c => c.id)

describe('before anybody has chosen', () => {
    it('shows priority, status and deadline in that order', () => {
        // Not board order here: there is no choice to respect yet, and
        // "how urgent, how far, by when" reads better than whatever order the
        // board happens to have.
        expect(ids(cardColumns(board()))).toEqual(['c5', 'c2', 'c4'])
    })

    it('does not count as a choice', () => {
        expect(hasCardChoice(board())).toBe(false)
    })

    it('leaves out a type the board does not have', () => {
        expect(cardColumns({columns: [{id: 'x', type: 'text'}]})).toEqual([])
    })

    it('survives a board with nothing on it', () => {
        expect(cardColumns({})).toEqual([])
        expect(cardColumns(null)).toEqual([])
        expect(isOnCard(board(), null)).toBe(false)
    })
})

describe('the first flip freezes what is on screen', () => {
    it('adds the column without dropping the defaults', () => {
        const next = {columns: toggledCardColumns(board(), 'c1')}
        expect(hasCardChoice(next)).toBe(true)
        // Board order from here on: the columns are already arranged in the
        // table, and a card that reorders them is one you cannot compare with
        // the row.
        expect(ids(cardColumns(next))).toEqual(['c1', 'c2', 'c4', 'c5'])
    })

    it('takes it off again on the second flip', () => {
        let next = {columns: toggledCardColumns(board(), 'c1')}
        next = {columns: toggledCardColumns(next, 'c1')}
        expect(ids(cardColumns(next))).toEqual(['c2', 'c4', 'c5'])
    })
})

describe('turning everything off', () => {
    it('leaves an empty card rather than snapping back to the default', () => {
        let next = board()
        for(const id of ['c5', 'c2', 'c4']) next = {columns: toggledCardColumns(next, id)}
        expect(cardColumns(next)).toEqual([])
        expect(hasCardChoice(next)).toBe(true)
    })
})
