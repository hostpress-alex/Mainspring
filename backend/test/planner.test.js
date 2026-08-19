/**
 * The planner's rules.
 *
 * This suite is the argument for having written the planner as code instead
 * of asking a model: every one of these is a statement somebody could
 * disagree with, and each of them can be settled by running the file. A plan
 * that comes out of a model can be argued about but not checked.
 *
 * The clock is a fixture, not `Date.now()`. Monday 17 August 2026, 08:00.
 */
const test = require('node:test')
const assert = require('node:assert')

const planner = require('../api/planner/planner.core')

const MIN = 60000
const at = (day, hour, minute = 0) => new Date(2026, 7, day, hour, minute).getTime()
const MONDAY_8 = at(17, 8)

/** Mon–Fri, 9 to 17, half an hour of lunch. */
const MO_FR = [1, 2, 3, 4, 5].map(weekday => ({weekday, startMin: 9 * 60, endMin: 17 * 60, breakMin: 30}))

const task = (over = {}) => ({
    taskId: 't1', boardId: 'b1', groupId: 'g1', title: 'Task',
    remainingMin: 60, deadline: null, priorityRank: 1, isAssumed: false, ...over
})

const minutesOf = block => Math.round((block.end - block.start) / MIN)
const hourOf = block => new Date(block.start).getHours()
const dayOf = block => new Date(block.start).getDate()

test('the fixture really is a Monday', () => {
    assert.strictEqual(new Date(MONDAY_8).getDay(), 1)
})

/* --------------------------------------------------------- the basics -- */

test('one task becomes one block at the start of the working day', () => {
    const {blocks} = planner.plan({tasks: [task()], workHours: MO_FR, from: MONDAY_8})
    assert.strictEqual(blocks.length, 1)
    assert.strictEqual(hourOf(blocks[0]), 9)
    assert.strictEqual(minutesOf(blocks[0]), 60)
})

test('nothing is planned into the past', () => {
    // Half past eleven on the Monday: the block cannot start at nine.
    const {blocks} = planner.plan({tasks: [task()], workHours: MO_FR, from: at(17, 11, 30)})
    assert.ok(blocks[0].start >= at(17, 11, 30))
})

test('a start time lands on a readable minute', () => {
    const {blocks} = planner.plan({tasks: [task()], workHours: MO_FR, from: at(17, 11, 32)})
    assert.strictEqual(new Date(blocks[0].start).getMinutes() % 5, 0)
})

test('somebody without working hours gets no plan at all', () => {
    const {blocks, unplaced} = planner.plan({tasks: [task()], workHours: [], from: MONDAY_8})
    assert.strictEqual(blocks.length, 0)
    assert.strictEqual(unplaced.length, 1)
})

test('a free day is skipped', () => {
    const saturday = at(22, 8)
    const {blocks} = planner.plan({tasks: [task()], workHours: MO_FR, from: saturday})
    // The next working day is the Monday after.
    assert.strictEqual(dayOf(blocks[0]), 24)
})

/* ------------------------------------------------------------- busy -- */

test('an appointment is not planned over', () => {
    const busy = [{start: at(17, 9), end: at(17, 12)}]
    const {blocks} = planner.plan({tasks: [task()], workHours: MO_FR, busy, from: MONDAY_8})
    assert.strictEqual(hourOf(blocks[0]), 12)
})

test('the planner uses the gap between two appointments', () => {
    const busy = [
        {start: at(17, 9), end: at(17, 10)},
        {start: at(17, 11), end: at(17, 17)}
    ]
    const {blocks} = planner.plan({tasks: [task({remainingMin: 60})], workHours: MO_FR, busy, from: MONDAY_8})
    assert.strictEqual(hourOf(blocks[0]), 10)
    assert.strictEqual(minutesOf(blocks[0]), 60)
})

test('a gap too small for a sensible block is left alone', () => {
    // Ten minutes free, then the day is gone.
    const busy = [
        {start: at(17, 9), end: at(17, 12)},
        {start: at(17, 12, 10), end: at(17, 17)}
    ]
    const {blocks} = planner.plan({tasks: [task({remainingMin: 120})], workHours: MO_FR, busy, from: MONDAY_8})
    assert.strictEqual(dayOf(blocks[0]), 18)
})

test('two blocks of the planner do not overlap each other', () => {
    const tasks = [task({taskId: 'a'}), task({taskId: 'b'}), task({taskId: 'c'})]
    const {blocks} = planner.plan({tasks, workHours: MO_FR, from: MONDAY_8})
    for(let i = 1; i < blocks.length; i++){
        assert.ok(blocks[i].start >= blocks[i - 1].end, 'blocks overlap')
    }
})

/* ------------------------------------------------------------ order -- */

test('the nearer deadline goes first', () => {
    const tasks = [
        task({taskId: 'late', deadline: at(20, 12), priorityRank: 0}),
        task({taskId: 'soon', deadline: at(17, 17), priorityRank: 9})
    ]
    const {blocks} = planner.plan({tasks, workHours: MO_FR, from: MONDAY_8})
    assert.strictEqual(blocks[0].taskId, 'soon')
})

test('with the same deadline, the higher place in the list wins', () => {
    const tasks = [
        task({taskId: 'low', priorityRank: 5, deadline: at(20, 12)}),
        task({taskId: 'high', priorityRank: 0, deadline: at(20, 12)})
    ]
    const {blocks} = planner.plan({tasks, workHours: MO_FR, from: MONDAY_8})
    assert.strictEqual(blocks[0].taskId, 'high')
})

test('a task with a deadline goes before one without', () => {
    const tasks = [
        task({taskId: 'whenever', priorityRank: 0}),
        task({taskId: 'friday', priorityRank: 9, deadline: at(21, 17)})
    ]
    const {blocks} = planner.plan({tasks, workHours: MO_FR, from: MONDAY_8})
    assert.strictEqual(blocks[0].taskId, 'friday')
})

test('the same input twice gives the same plan', () => {
    const tasks = [
        task({taskId: 'a', remainingMin: 90}),
        task({taskId: 'b', remainingMin: 45, deadline: at(19, 17)}),
        task({taskId: 'c', remainingMin: 300, priorityRank: 0})
    ]
    const one = planner.plan({tasks, workHours: MO_FR, from: MONDAY_8})
    const two = planner.plan({tasks, workHours: MO_FR, from: MONDAY_8})
    assert.deepStrictEqual(one, two)
})

/* ------------------------------------------------------ long tasks -- */

test('work that does not fit into a day continues the next day', () => {
    const {blocks} = planner.plan({
        tasks: [task({remainingMin: 10 * 60})], workHours: MO_FR, from: MONDAY_8
    })
    assert.ok(blocks.length >= 2, 'expected more than one block')
    assert.strictEqual(dayOf(blocks[0]), 17)
    assert.strictEqual(dayOf(blocks[1]), 18)
})

test('one task gets at most one block per day', () => {
    const {blocks} = planner.plan({
        tasks: [task({remainingMin: 20 * 60})], workHours: MO_FR, from: MONDAY_8
    })
    const perDay = {}
    for(const block of blocks) perDay[dayOf(block)] = (perDay[dayOf(block)] || 0) + 1
    assert.ok(Object.values(perDay).every(n => n === 1), 'a task was planned twice on one day')
})

test('without a deadline no block is longer than the ceiling', () => {
    const {blocks} = planner.plan({
        tasks: [task({remainingMin: 20 * 60})], workHours: MO_FR, from: MONDAY_8
    })
    assert.ok(blocks.every(b => minutesOf(b) <= planner.MAX_CHUNK_MIN))
})

test('work with a deadline may take the whole day', () => {
    // The cap is lifted for deadline work — otherwise the planner reports
    // "does not fit" for something somebody could finish in two full days.
    const {blocks} = planner.plan({
        tasks: [task({remainingMin: 20 * 60, deadline: at(21, 17)})], workHours: MO_FR, from: MONDAY_8
    })
    const monday = blocks.filter(b => dayOf(b) === 17).reduce((sum, b) => sum + minutesOf(b), 0)
    // 9 to 17 minus half an hour of lunch is seven and a half hours.
    assert.strictEqual(monday, 7 * 60 + 30)
})

test('two full days of deadline work fit into two days', () => {
    const {unplaced} = planner.plan({
        tasks: [task({remainingMin: 15 * 60, deadline: at(18, 17)})], workHours: MO_FR, from: MONDAY_8
    })
    assert.deepStrictEqual(unplaced, [])
})

test('no crumb is left for the next morning', () => {
    // 9 to 17 with half an hour of lunch is 450 minutes of capacity. A task
    // of 455 used to be planned as 450 today and FIVE MINUTES tomorrow.
    const {blocks} = planner.plan({
        tasks: [task({remainingMin: 455})], workHours: MO_FR, from: MONDAY_8
    })
    assert.ok(blocks.every(b => minutesOf(b) >= planner.MIN_CHUNK_MIN),
        'a block shorter than the minimum was planned: ' + blocks.map(minutesOf).join(', '))
})

test('a crumb is avoided by taking less today, not by cutting it off', () => {
    // 455 minutes against 450 of capacity: the day cannot swallow the five
    // extra minutes, so today gives some back and tomorrow gets a real block.
    const {blocks} = planner.plan({
        tasks: [task({remainingMin: 455, deadline: at(21, 17)})], workHours: MO_FR, from: MONDAY_8
    })
    assert.deepStrictEqual(blocks.map(minutesOf), [425, 30])
})

test('what fits in the gap is finished there rather than split', () => {
    // Same crumb, but with room to spare — then the block simply grows.
    const busy = []
    const {blocks} = planner.plan({
        tasks: [task({remainingMin: 200, deadline: at(21, 17)})], workHours: MO_FR, busy, from: MONDAY_8
    })
    assert.strictEqual(blocks.length, 1)
    assert.strictEqual(minutesOf(blocks[0]), 200)
})

test('a task smaller than the minimum is still planned', () => {
    // The other side of the same rule: ten minutes of work is one block of
    // ten minutes, not nothing at all.
    const {blocks} = planner.plan({
        tasks: [task({remainingMin: 10})], workHours: MO_FR, from: MONDAY_8
    })
    assert.strictEqual(blocks.length, 1)
    assert.strictEqual(minutesOf(blocks[0]), 10)
})

/* -------------------------------------------------------- deadlines -- */

test('nothing is planned after its deadline', () => {
    const deadline = at(18, 12)
    const {blocks} = planner.plan({
        tasks: [task({remainingMin: 40 * 60, deadline})], workHours: MO_FR, from: MONDAY_8
    })
    const endOfDeadlineDay = at(19, 0)
    assert.ok(blocks.every(b => b.end <= endOfDeadlineDay))
})

test('what does not fit before the deadline is reported, not hidden', () => {
    const {blocks, unplaced} = planner.plan({
        tasks: [task({remainingMin: 40 * 60, deadline: at(18, 12)})], workHours: MO_FR, from: MONDAY_8
    })
    assert.ok(blocks.length > 0, 'what fits is still planned')
    assert.strictEqual(unplaced.length, 1)
    assert.strictEqual(unplaced[0].reason, 'deadline')
    assert.ok(unplaced[0].remainingMin > 0)
})

test('work beyond the horizon is reported as such', () => {
    const {unplaced} = planner.plan({
        tasks: [task({remainingMin: 400 * 60})], workHours: MO_FR, from: MONDAY_8, horizonDays: 5
    })
    assert.strictEqual(unplaced[0].reason, 'horizon')
})

/* --------------------------------------------------------- assumed -- */

test('an assumed duration is carried into every block it produced', () => {
    const {blocks, assumedCount} = planner.plan({
        tasks: [task({remainingMin: 10 * 60, isAssumed: true})], workHours: MO_FR, from: MONDAY_8
    })
    assert.ok(blocks.every(b => b.isAssumed))
    assert.strictEqual(assumedCount, blocks.length)
})

test('a task with nothing left over is not planned again', () => {
    const {blocks} = planner.plan({tasks: [task({remainingMin: 0})], workHours: MO_FR, from: MONDAY_8})
    assert.strictEqual(blocks.length, 0)
})

/* ------------------------------------------------------------ week -- */

test('a Monday has the whole week left', () => {
    assert.strictEqual(planner.daysLeftInWeek(at(17, 10)), 7)
})

test('a Friday has three days left, weekend included', () => {
    assert.strictEqual(planner.daysLeftInWeek(at(21, 10)), 3)
})

test('a Sunday is the last day of its week', () => {
    assert.strictEqual(planner.daysLeftInWeek(at(23, 10)), 1)
})

test('what does not fit into the given days is left for later', () => {
    // Thursday, so two working days remain: 900 minutes of capacity against
    // 1500 of work.
    const {blocks, unplaced} = planner.plan({
        tasks: [task({remainingMin: 1500})],
        workHours: MO_FR, from: at(20, 9), horizonDays: planner.daysLeftInWeek(at(20, 9))
    })
    assert.ok(blocks.length > 0)
    assert.strictEqual(unplaced.length, 1)
    assert.strictEqual(unplaced[0].reason, 'horizon')
    assert.ok(blocks.every(b => dayOf(b) <= 23), 'nothing may spill into the next week')
})

/* ------------------------------------------------------------ gaps -- */

test('a full day leaves no free interval', () => {
    const busy = [{start: at(17, 9), end: at(17, 17)}]
    const gaps = planner.freeIntervals(at(17, 0), MO_FR[0], busy)
    assert.deepStrictEqual(gaps, [])
})

test('touching appointments are one block, not two', () => {
    const merged = planner.merge([
        {start: at(17, 9), end: at(17, 10)},
        {start: at(17, 10), end: at(17, 11)}
    ])
    assert.strictEqual(merged.length, 1)
    assert.strictEqual(merged[0].end, at(17, 11))
})

test('a day crossing the change of clocks keeps its hours', () => {
    // The last Sunday of October is when the clocks go back here.
    const before = new Date(2026, 9, 24, 9).getTime()
    const after = planner.addDays(before, 2)
    assert.strictEqual(new Date(after).getHours(), 9)
})
