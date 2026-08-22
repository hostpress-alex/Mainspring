import {describe, it, expect} from 'vitest'
import {statsOfHtml, checklistOf, fractionOf, isComplete} from '../services/checklist'
import {toggleTaskItem} from '../services/rich-text'

/**
 * The circle in the task row counts tiptap task items out of the updates.
 *
 * Two things are worth holding still here. One: the markup is written by
 * tiptap and read by a regex, so the shape of that markup is a contract — the
 * round trip at the bottom is what proves the counter and `toggleTaskItem`
 * still agree with each other, rather than each being right on its own.
 *
 * Two: the difference between "no checklist" and "a checklist with nothing
 * ticked". The first draws nothing at all; the second draws an empty circle.
 */
const item = (text, checked) =>
    `<li data-checked="${checked}" data-type="taskItem">`
    + `<label><input type="checkbox"${checked?' checked':''}><span></span></label>`
    + `<div><p>${text}</p></div></li>`
const list = (...items) => `<ul data-type="taskList">${items.join('')}</ul>`

describe('counting one update', () => {
    it('counts the items and the ticks', () => {
        const html = list(item('a', true), item('b', true), item('c', false), item('d', false))
        expect(statsOfHtml(html)).toEqual({total: 4, done: 2})
    })

    it('ignores an ordinary list', () => {
        expect(statsOfHtml('<ul><li>shopping</li></ul>')).toEqual({total: 0, done: 0})
    })

    it('does not care in which order tiptap wrote the attributes', () => {
        expect(statsOfHtml('<li data-type="taskItem" data-checked="true"></li>').done).toBe(1)
    })

    it('gives the same answer the second time', () => {
        // The tag regex is a module-level /g, which keeps lastIndex between
        // calls. Without a reset a task would look half empty at random.
        const html = list(item('a', true), item('b', false))
        expect(statsOfHtml(html)).toEqual(statsOfHtml(html))
    })
})

describe('a whole task', () => {
    it('adds every update together, including the ones without a list', () => {
        const task = {comments: [
            {txt: list(item('a', true), item('b', false), item('c', false), item('d', false))},
            {txt: list(item('e', true), item('f', true), item('g', false), item('h', false))},
            {txt: '<p>just words</p>'}
        ]}
        expect(checklistOf(task)).toEqual({total: 8, done: 3})
    })

    it('is null when nothing on the task has a checklist', () => {
        // Null, not {total: 0}: the row draws nothing for null, and "no
        // checklist" is not "a checklist with nothing done".
        expect(checklistOf({comments: [{txt: '<p>nothing</p>'}]})).toBeNull()
        expect(checklistOf({})).toBeNull()
        expect(checklistOf(null)).toBeNull()
    })
})

describe('what the circle is filled with', () => {
    it('is the fraction that is done', () => {
        expect(fractionOf({total: 4, done: 1})).toBe(0.25)
    })

    it('is empty rather than full when there is nothing to divide by', () => {
        expect(fractionOf({total: 0, done: 0})).toBe(0)
        expect(fractionOf(null)).toBe(0)
    })

    it('calls an empty list unfinished, not finished', () => {
        expect(isComplete({total: 0, done: 0})).toBe(false)
        expect(isComplete({total: 4, done: 4})).toBe(true)
    })
})

describe('ticking a box moves the circle', () => {
    it('agrees with what toggleTaskItem writes back', () => {
        // The round trip: the counter reads what the toggle writes. If either
        // side changes its idea of the markup, this is where it shows.
        const html = list(item('a', false), item('b', false))
        expect(statsOfHtml(html)).toEqual({total: 2, done: 0})

        const first = toggleTaskItem(html, 0)
        expect(statsOfHtml(first.html)).toEqual({total: 2, done: 1})

        const second = toggleTaskItem(first.html, 1)
        expect(statsOfHtml(second.html)).toEqual({total: 2, done: 2})
        expect(isComplete(statsOfHtml(second.html))).toBe(true)

        const undone = toggleTaskItem(second.html, 0)
        expect(statsOfHtml(undone.html)).toEqual({total: 2, done: 1})
    })
})
