import {describe, it, expect} from 'vitest'
import {touchedBy} from '../services/updated-by'
import {GUEST_IMG} from '../services/avatar'

const user = {_id: 'u1', imgUrl: '/api/upload/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'}

describe('touchedBy — the "last updated" stamp', () => {
    it('keeps what the task already carried', () => {
        const task = {updatedBy: {_id: 'u9', imgUrl: '/api/upload/bb', note: 'kept'}}
        expect(touchedBy(task, user).note).toBe('kept')
        expect(touchedBy(task, user)._id).toBe('u9')
    })

    it('works on a task that has no updatedBy at all — the bug', () => {
        // A task created through the API has no such key. The old code wrote
        // into it and threw inside the event handler, so the save never
        // happened and nothing on screen said why.
        const stamp = touchedBy({id: 't1', title: 'Serverumzug'}, user)
        expect(stamp.imgUrl).toBe(user.imgUrl)
        expect(Number.isFinite(stamp.date)).toBe(true)
    })

    it('survives a task that is not there', () => {
        expect(() => touchedBy(undefined, user)).not.toThrow()
        expect(() => touchedBy(null, null)).not.toThrow()
    })

    it('falls back to the guest picture when nobody is signed in', () => {
        expect(touchedBy({}, null).imgUrl).toBe(GUEST_IMG)
        expect(touchedBy({}, {_id: 'u1'}).imgUrl).toBe(GUEST_IMG)
    })

    it('overwrites the old date and picture rather than keeping them', () => {
        const task = {updatedBy: {date: 1, imgUrl: '/api/upload/old'}}
        const stamp = touchedBy(task, user)
        expect(stamp.date).toBeGreaterThan(1)
        expect(stamp.imgUrl).toBe(user.imgUrl)
    })

    it('does not write into the task it was given', () => {
        const task = {}
        touchedBy(task, user)
        expect(task.updatedBy).toBeUndefined()
    })
})
