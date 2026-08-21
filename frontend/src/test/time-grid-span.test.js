import {describe, it, expect} from 'vitest'
import {spanOfInterest} from '../cmps/calendar/time-grid'

/** A day at a known weekday: 20 Aug 2026 is a Thursday. */
const thursday = new Date(2026, 7, 20)
const saturday = new Date(2026, 7, 22)
const at = (h, m = 0) => new Date(2026, 7, 20, h, m)

const hours = [{weekday: 4, startMin: 9 * 60, endMin: 17 * 60}]   // Thu 09-17

describe('spanOfInterest — where the calendar should open', () => {
    it('takes the earliest start and the latest end', () => {
        const span = spanOfInterest([
            {start: at(10), end: at(11)},
            {start: at(14), end: at(15, 30)}
        ], [thursday], hours)
        expect(span).toEqual({fromMin: 10 * 60, toMin: 15 * 60 + 30})
    })

    it('does not let a lunchtime block hide an early one', () => {
        const span = spanOfInterest([
            {start: at(13), end: at(14)},
            {start: at(6, 30), end: at(7)}
        ], [thursday], hours)
        expect(span.fromMin).toBe(6 * 60 + 30)
    })

    it('falls back to the working hours of the days shown', () => {
        // An empty Thursday still opens on Thursday's working day.
        expect(spanOfInterest([], [thursday], hours)).toEqual({fromMin: 9 * 60, toMin: 17 * 60})
    })

    it('falls back to an office day when nothing is known', () => {
        expect(spanOfInterest([], [saturday], hours)).toEqual({fromMin: 8 * 60, toMin: 18 * 60})
        expect(spanOfInterest([], [], [])).toEqual({fromMin: 8 * 60, toMin: 18 * 60})
        expect(spanOfInterest(null, null, null)).toEqual({fromMin: 8 * 60, toMin: 18 * 60})
    })

    it('prefers entries over working hours', () => {
        // Something at 06:00 on a 09-17 day is the reason to be looking.
        const span = spanOfInterest([{start: at(6), end: at(6, 45)}], [thursday], hours)
        expect(span.fromMin).toBe(6 * 60)
    })

    it('reads midnight at the end as the end of the day', () => {
        // Otherwise an entry running to 00:00 comes out as a block of
        // negative height and the view lands nowhere.
        const span = spanOfInterest([{start: at(22), end: new Date(2026, 7, 21, 0, 0)}], [thursday], hours)
        expect(span.fromMin).toBe(22 * 60)
        expect(span.toMin).toBe(1440)
    })

    it('takes a moment however it arrived', () => {
        // A schedule entry carries an ISO string from the server, a Google
        // event carries milliseconds, a dragged one carries a Date.
        const iso = spanOfInterest([{start: at(10).toISOString(), end: at(11).toISOString()}], [thursday], hours)
        const ms = spanOfInterest([{start: +at(10), end: +at(11)}], [thursday], hours)
        expect(iso).toEqual({fromMin: 600, toMin: 660})
        expect(ms).toEqual({fromMin: 600, toMin: 660})
    })

    it('skips an entry with no usable time instead of failing', () => {
        const span = spanOfInterest([
            {start: null, end: null},
            {start: 'nonsense', end: 'nonsense'},
            {start: at(11), end: at(12)}
        ], [thursday], hours)
        expect(span).toEqual({fromMin: 11 * 60, toMin: 12 * 60})
    })

    it('gives an entry of no length something to aim at', () => {
        const span = spanOfInterest([{start: at(10), end: at(10)}], [thursday], hours)
        expect(span.toMin).toBeGreaterThan(span.fromMin)
    })

    it('spans the working hours of a whole week', () => {
        const week = [new Date(2026, 7, 17), new Date(2026, 7, 18), thursday]
        const mixed = [
            {weekday: 1, startMin: 7 * 60, endMin: 15 * 60},
            {weekday: 4, startMin: 10 * 60, endMin: 19 * 60}
        ]
        expect(spanOfInterest([], week, mixed)).toEqual({fromMin: 7 * 60, toMin: 19 * 60})
    })
})
