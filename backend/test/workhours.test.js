/**
 * Working hours: what may be written, and what a window adds up to.
 *
 * The validation is the interesting half. Every one of these numbers is later
 * summed into a capacity figure somebody makes a decision with, so a shift
 * that ends before it starts must not be storable — a wrong number that looks
 * like a number is worse than a refusal.
 *
 * The pure parts only; the repository is not involved.
 */
const test = require('node:test')
const assert = require('node:assert')

const wh = require('../api/workhours/workhours.service')

const day = (weekday, startMin, endMin, breakMin = 0) => ({weekday, startMin, endMin, breakMin})
const throws400 = fn => assert.throws(fn, err => err.status === 400)

/* ---------------------------------------------------------- one day -- */

test('an ordinary day is taken as it is', () => {
    assert.deepStrictEqual(wh.cleanDay(day(1, 540, 1020, 30)),
        {weekday: 1, startMin: 540, endMin: 1020, breakMin: 30})
})

test('a day that ends before it begins is refused', () => {
    throws400(() => wh.cleanDay(day(1, 1020, 540)))
})

test('a day of no length is refused', () => {
    throws400(() => wh.cleanDay(day(1, 540, 540)))
})

test('a break that eats the whole day is refused', () => {
    throws400(() => wh.cleanDay(day(1, 540, 600, 60)))
    throws400(() => wh.cleanDay(day(1, 540, 600, 90)))
})

test('a weekday outside the week is refused', () => {
    throws400(() => wh.cleanDay(day(7, 540, 1020)))
    throws400(() => wh.cleanDay(day(-1, 540, 1020)))
})

test('a time beyond midnight is refused', () => {
    throws400(() => wh.cleanDay(day(1, 540, 1441)))
})

test('a shift up to midnight is allowed', () => {
    assert.strictEqual(wh.cleanDay(day(5, 960, 1440)).endMin, 1440)
})

test('half minutes are not a thing', () => {
    throws400(() => wh.cleanDay(day(1, 540.5, 1020)))
})

test('a missing break counts as none', () => {
    assert.strictEqual(wh.cleanDay({weekday: 2, startMin: 540, endMin: 600}).breakMin, 0)
})

/* --------------------------------------------------------- one week -- */

test('a week comes back sorted', () => {
    const week = wh.cleanWeek([day(3, 540, 1020), day(1, 540, 1020)])
    assert.deepStrictEqual(week.map(d => d.weekday), [1, 3])
})

test('the same weekday twice is refused', () => {
    throws400(() => wh.cleanWeek([day(1, 540, 1020), day(1, 600, 1080)]))
})

test('an empty week is allowed — that is somebody with no fixed hours', () => {
    assert.deepStrictEqual(wh.cleanWeek([]), [])
})

test('something that is not a list is refused', () => {
    throws400(() => wh.cleanWeek(null))
    throws400(() => wh.cleanWeek({weekday: 1}))
})

/* ------------------------------------------------------- the minutes -- */

test('a day is its length minus the break', () => {
    assert.strictEqual(wh.minutesOfDay(day(1, 540, 1020, 30)), 450)
})

test('a day nobody works is worth nothing', () => {
    assert.strictEqual(wh.minutesOfDay(null), 0)
    assert.strictEqual(wh.minutesOfDay(undefined), 0)
})

/* Monday 18 August 2026 is a Tuesday in no calendar; the dates below are
   checked against getDay() rather than assumed. */
const MONDAY = new Date(2026, 7, 17)   // 17 August 2026, a Monday
const NEXT_MONDAY = new Date(2026, 7, 24)

test('the fixture really is a Monday', () => {
    assert.strictEqual(MONDAY.getDay(), 1)
})

const MO_FR = [1, 2, 3, 4, 5].map(d => day(d, 540, 1020, 30))

test('a full week of Monday to Friday adds up', () => {
    assert.strictEqual(wh.availableMinutes(MO_FR, MONDAY, NEXT_MONDAY), 5 * 450)
})

test('a weekend on its own is empty', () => {
    const saturday = new Date(2026, 7, 22)
    const monday = new Date(2026, 7, 24)
    assert.strictEqual(wh.availableMinutes(MO_FR, saturday, monday), 0)
})

test('half a week counts half', () => {
    const wednesday = new Date(2026, 7, 19)
    assert.strictEqual(wh.availableMinutes(MO_FR, MONDAY, wednesday), 2 * 450)
})

test('the end of the window is not part of it', () => {
    const tuesday = new Date(2026, 7, 18)
    assert.strictEqual(wh.availableMinutes(MO_FR, MONDAY, tuesday), 450)
})

test('a window that starts mid-morning still counts the whole day', () => {
    // Deliberate: a range is asked in days, and clipping the first day would
    // make "this week" depend on the minute the page was opened.
    const mondayLate = new Date(2026, 7, 17, 14, 30)
    assert.strictEqual(wh.availableMinutes(MO_FR, mondayLate, NEXT_MONDAY), 5 * 450)
})

test('somebody with no hours has no capacity', () => {
    assert.strictEqual(wh.availableMinutes([], MONDAY, NEXT_MONDAY), 0)
})

test('a four-week window is four weeks of hours', () => {
    const fourWeeks = new Date(2026, 7, 17 + 28)
    assert.strictEqual(wh.availableMinutes(MO_FR, MONDAY, fourWeeks), 4 * 5 * 450)
})

test('a weekend worker is counted on the weekend', () => {
    const saturday = new Date(2026, 7, 22)
    const monday = new Date(2026, 7, 24)
    assert.strictEqual(wh.availableMinutes([day(6, 600, 840)], saturday, monday), 240)
})
