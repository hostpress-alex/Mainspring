/**
 * Time tracking: the rules, without a database.
 *
 * The repository is replaced by an in-memory one, so what is under test is the
 * part that can actually be wrong — one timer at a time, the question asked
 * before a second one starts, what a forgotten timer turns into, and who may
 * touch whose entries. Storage is not being tested; knex is.
 *
 * The clock is injected the same way: `now` is a variable this file moves, so
 * "eight hours later" costs nothing and does not make the suite slow or flaky.
 */
const test = require('node:test')
const assert = require('node:assert')

const repoPath = require.resolve('../api/time/time.repo')
const loggerPath = require.resolve('../services/logger.service')

const OWNER = {_id: 'u_owner', fullname: 'Owner'}
const EDITOR = {_id: 'u_editor', fullname: 'Editor'}
const OTHER = {_id: 'u_other', fullname: 'Other'}
const VIEWER = {_id: 'u_viewer', fullname: 'Viewer'}

const BOARD = 'b1'
const ROLES = {
    [OWNER._id]: 'owner',
    [EDITOR._id]: 'editor',
    [OTHER._id]: 'editor',
    [VIEWER._id]: 'viewer'
}

let rows = []
let seq = 0
let now = 1_700_000_000_000

require.cache[loggerPath] = {
    id: loggerPath, filename: loggerPath, loaded: true,
    exports: {warn(){}, error(){}, info(){}, debug(){}}
}

const repoStub = {
    newId: () => `e${++seq}`,
    async findById(id){ return rows.find(r => r.id === id) || null },
    async findRunning(userId){
        return rows.find(r => String(r.userId) === String(userId) && r.endedAt === null) || null
    },
    async findAllRunning(){ return rows.filter(r => r.endedAt === null) },
    async findForTask(boardId, taskId){
        return rows.filter(r => r.boardId === boardId && r.taskId === taskId)
            .sort((a, b) => a.startedAt - b.startedAt)
    },
    async totalsForBoard(boardId){
        const totals = {}
        for(const r of rows.filter(r => r.boardId === boardId && r.endedAt !== null)){
            totals[r.taskId] = (totals[r.taskId] || 0) + (r.endedAt - r.startedAt)
        }
        return totals
    },
    async insert(entry){
        const row = {
            id: entry.id || `e${++seq}`,
            boardId: entry.boardId, taskId: entry.taskId, userId: String(entry.userId),
            startedAt: entry.startedAt,
            endedAt: entry.endedAt === undefined?null:entry.endedAt,
            note: entry.note || '', source: entry.source || 'timer',
            endedBy: entry.endedBy || null
        }
        rows.push(row)
        return row
    },
    async update(id, patch){
        const row = rows.find(r => r.id === id)
        if(!row) return null
        if(patch.startedAt !== undefined) row.startedAt = patch.startedAt
        if(patch.endedAt !== undefined) row.endedAt = patch.endedAt
        if(patch.note !== undefined) row.note = patch.note || ''
        if(patch.endedBy !== undefined) row.endedBy = patch.endedBy || null
        return row
    },
    async remove(id){ rows = rows.filter(r => r.id !== id) },
    async roleOnBoard(boardId, userId){ return boardId === BOARD?(ROLES[userId] || null):null },
    async taskLocation(boardId, taskId){
        return boardId === BOARD?{title: `Task ${taskId}`, groupId: 'g1'}:null
    }
}

require.cache[repoPath] = {id: repoPath, filename: repoPath, loaded: true, exports: repoStub}

const realNow = Date.now
Date.now = () => now

const timeService = require('../api/time/time.service')
const HOUR = 60 * 60 * 1000

function reset(){
    rows = []
    seq = 0
    now = 1_700_000_000_000
}

async function refusedWith(fn){
    try {
        await fn()
        return null
    } catch(err) {
        return err
    }
}

/* ------------------------------------------------------- one at a time -- */

test('starting a second task asks instead of switching silently', async () => {
    reset()
    await timeService.start(EDITOR, {boardId: BOARD, taskId: 't1'})
    now += 30 * 60 * 1000

    const err = await refusedWith(() => timeService.start(EDITOR, {boardId: BOARD, taskId: 't2'}))
    assert.strictEqual(err.status, 409)
    assert.strictEqual(err.code, 'ALREADY_RUNNING')
    assert.strictEqual(err.running.taskId, 't1')
    // Nothing moved: the first timer is still the one that is running.
    assert.strictEqual(rows.filter(r => r.endedAt === null).length, 1)
})

test('with an answer, the old one closes and the new one starts in one step', async () => {
    reset()
    await timeService.start(EDITOR, {boardId: BOARD, taskId: 't1'})
    now += 30 * 60 * 1000
    await timeService.start(EDITOR, {boardId: BOARD, taskId: 't2', resolve: {mode: 'pause', note: 'later'}})

    const first = rows.find(r => r.taskId === 't1')
    assert.strictEqual(first.endedBy, 'pause')
    assert.strictEqual(first.note, 'later')
    assert.strictEqual(first.endedAt - first.startedAt, 30 * 60 * 1000)

    const running = rows.filter(r => r.endedAt === null)
    assert.strictEqual(running.length, 1)
    assert.strictEqual(running[0].taskId, 't2')
})

test('pressing start twice on the same task does not open a second interval', async () => {
    reset()
    const first = await timeService.start(EDITOR, {boardId: BOARD, taskId: 't1'})
    now += 5 * 60 * 1000
    const again = await timeService.start(EDITOR, {boardId: BOARD, taskId: 't1'})
    assert.strictEqual(again.id, first.id)
    assert.strictEqual(rows.length, 1)
})

test('two people may run their own timers at the same time', async () => {
    reset()
    await timeService.start(EDITOR, {boardId: BOARD, taskId: 't1'})
    await timeService.start(OTHER, {boardId: BOARD, taskId: 't1'})
    assert.strictEqual(rows.filter(r => r.endedAt === null).length, 2)
})

/* ----------------------------------------------------- pause and stop -- */

test('pause and stop record the same minutes and differ only in the log', async () => {
    reset()
    await timeService.start(EDITOR, {boardId: BOARD, taskId: 't1'})
    now += 20 * 60 * 1000
    await timeService.close(EDITOR, {mode: 'pause'})

    await timeService.start(EDITOR, {boardId: BOARD, taskId: 't1'})
    now += 10 * 60 * 1000
    await timeService.close(EDITOR, {mode: 'stop'})

    const {total, entries} = await timeService.forTask(EDITOR, BOARD, 't1')
    assert.strictEqual(entries.length, 2)
    assert.strictEqual(entries[0].endedBy, 'pause')
    assert.strictEqual(entries[1].endedBy, 'stop')
    assert.strictEqual(total, 30 * 60 * 1000)
})

test('a mis-click is dropped rather than recorded as nothing', async () => {
    reset()
    await timeService.start(EDITOR, {boardId: BOARD, taskId: 't1'})
    now += 200
    const result = await timeService.close(EDITOR, {mode: 'stop'})
    assert.strictEqual(result.removed, true)
    assert.strictEqual(rows.length, 0)
})

test('a mis-click with a note is kept, because the note was meant', async () => {
    reset()
    await timeService.start(EDITOR, {boardId: BOARD, taskId: 't1'})
    now += 200
    const result = await timeService.close(EDITOR, {mode: 'stop', note: 'wrong task'})
    assert.strictEqual(result.removed, false)
    assert.strictEqual(rows.length, 1)
})

test('stopping with nothing running is refused', async () => {
    reset()
    const err = await refusedWith(() => timeService.close(EDITOR, {mode: 'stop'}))
    assert.strictEqual(err.status, 409)
})

/* ------------------------------------------- when the interval really ended -- */

test('the moment the button was pressed counts, not the moment the note was finished', async () => {
    reset()
    await timeService.start(EDITOR, {boardId: BOARD, taskId: 't1'})
    const pressedAt = now + 20 * 60 * 1000

    // Twenty minutes of work, then three minutes writing about it.
    now = pressedAt + 3 * 60 * 1000
    await timeService.close(EDITOR, {mode: 'pause', note: 'done a thing', endedAt: pressedAt})

    assert.strictEqual(rows[0].endedAt - rows[0].startedAt, 20 * 60 * 1000)
})

test('a client-sent end is clamped and can only ever shorten', async () => {
    reset()
    await timeService.start(EDITOR, {boardId: BOARD, taskId: 't1'})
    const startedAt = rows[0].startedAt
    now += 10 * 60 * 1000

    // An hour into the future: booking time that has not happened.
    await timeService.close(EDITOR, {mode: 'stop', endedAt: now + HOUR})
    assert.strictEqual(rows[0].endedAt, now)

    reset()
    await timeService.start(EDITOR, {boardId: BOARD, taskId: 't1'})
    now += 10 * 60 * 1000
    // Before its own start: would be a negative interval.
    await timeService.close(EDITOR, {mode: 'stop', endedAt: rows[0].startedAt - HOUR, note: 'x'})
    assert.strictEqual(rows[0].endedAt, rows[0].startedAt)
})

/* --------------------------------------------------- forgotten timers -- */

test('a forgotten timer is closed at the cap and marked, not at the moment it is noticed', async () => {
    reset()
    await timeService.start(EDITOR, {boardId: BOARD, taskId: 't1'})
    const startedAt = rows[0].startedAt

    // Home on Friday, back on Monday.
    now += 72 * HOUR
    await timeService.running(EDITOR)

    const row = rows[0]
    assert.strictEqual(row.endedBy, 'auto')
    assert.strictEqual(row.endedAt, startedAt + timeService.MAX_MS)
    assert.ok(row.endedAt - row.startedAt <= timeService.MAX_MS)
})

test('an automatically closed entry stops being the machine\'s word once corrected', async () => {
    reset()
    await timeService.start(EDITOR, {boardId: BOARD, taskId: 't1'})
    now += 72 * HOUR
    await timeService.running(EDITOR)

    const id = rows[0].id
    await timeService.edit(EDITOR, id, {startedAt: now - 2 * HOUR, endedAt: now})
    assert.strictEqual(rows[0].endedBy, 'stop')
})

/* ------------------------------------------------------- corrections -- */

test('an entry typed in by hand is marked as such', async () => {
    reset()
    const entry = await timeService.addManual(EDITOR, {
        boardId: BOARD, taskId: 't1', startedAt: now - 2 * HOUR, endedAt: now - HOUR, note: 'forgot to start'
    })
    assert.strictEqual(entry.source, 'manual')
    assert.strictEqual(entry.endedBy, 'stop')
})

test('an entry that ends before it starts is refused', async () => {
    reset()
    const err = await refusedWith(() => timeService.addManual(EDITOR, {
        boardId: BOARD, taskId: 't1', startedAt: now, endedAt: now - HOUR
    }))
    assert.strictEqual(err.status, 400)
})

test('an entry longer than the cap is refused', async () => {
    reset()
    const err = await refusedWith(() => timeService.addManual(EDITOR, {
        boardId: BOARD, taskId: 't1', startedAt: now - 40 * HOUR, endedAt: now
    }))
    assert.strictEqual(err.status, 400)
})

test('a running entry cannot be edited', async () => {
    reset()
    const entry = await timeService.start(EDITOR, {boardId: BOARD, taskId: 't1'})
    const err = await refusedWith(() => timeService.edit(EDITOR, entry.id, {note: 'x'}))
    assert.strictEqual(err.status, 409)
})

/* -------------------------------------------------------- permissions -- */

test('a viewer may read the times and not record any', async () => {
    reset()
    await timeService.start(EDITOR, {boardId: BOARD, taskId: 't1'})
    now += HOUR
    await timeService.close(EDITOR, {mode: 'stop'})

    const read = await timeService.forTask(VIEWER, BOARD, 't1')
    assert.strictEqual(read.entries.length, 1)

    const err = await refusedWith(() => timeService.start(VIEWER, {boardId: BOARD, taskId: 't1'}))
    assert.strictEqual(err.status, 403)
})

test('somebody with no place on the board is told the board does not exist', async () => {
    reset()
    const err = await refusedWith(() => timeService.forTask({_id: 'u_stranger'}, BOARD, 't1'))
    assert.strictEqual(err.status, 404)
})

test('an editor may not change somebody else\'s entry, an owner may', async () => {
    reset()
    await timeService.start(OTHER, {boardId: BOARD, taskId: 't1'})
    now += HOUR
    await timeService.close(OTHER, {mode: 'stop'})
    const id = rows[0].id

    const refused = await refusedWith(() => timeService.remove(EDITOR, id))
    assert.strictEqual(refused.status, 403)

    const allowed = await refusedWith(() => timeService.remove(OWNER, id))
    assert.strictEqual(allowed, null)
    assert.strictEqual(rows.length, 0)
})

test('an admin counts as an owner even without a member row', async () => {
    reset()
    await timeService.start(OTHER, {boardId: BOARD, taskId: 't1'})
    now += HOUR
    await timeService.close(OTHER, {mode: 'stop'})

    const err = await refusedWith(() => timeService.remove({_id: 'u_admin', isAdmin: true}, rows[0].id))
    assert.strictEqual(err, null)
})

/* ------------------------------------------------------------ totals -- */

test('the totals add up per task and per person', async () => {
    reset()
    await timeService.start(EDITOR, {boardId: BOARD, taskId: 't1'})
    now += HOUR
    await timeService.close(EDITOR, {mode: 'stop'})

    await timeService.start(OTHER, {boardId: BOARD, taskId: 't1'})
    now += 30 * 60 * 1000
    await timeService.close(OTHER, {mode: 'stop'})

    const {total, byUser} = await timeService.forTask(EDITOR, BOARD, 't1')
    assert.strictEqual(total, 90 * 60 * 1000)
    assert.strictEqual(byUser[EDITOR._id], HOUR)
    assert.strictEqual(byUser[OTHER._id], 30 * 60 * 1000)

    const totals = await timeService.totalsForBoard(EDITOR, BOARD)
    assert.strictEqual(totals.t1, 90 * 60 * 1000)
})

test('a running timer is not counted into the total', async () => {
    reset()
    await timeService.start(EDITOR, {boardId: BOARD, taskId: 't1'})
    now += HOUR
    const {total} = await timeService.forTask(EDITOR, BOARD, 't1')
    assert.strictEqual(total, 0)
})

test.after(() => { Date.now = realNow })
