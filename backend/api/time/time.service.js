/**
 * Time tracking.
 *
 * Three things happen here that the storage layer deliberately does not know
 * about:
 *
 *   1. **One timer per person.** Not a database constraint — a rule with a
 *      question attached. Starting a second task does not silently close the
 *      first one; the caller is told what is running and decides whether to
 *      pause it or stop it. Silently reassigning somebody's afternoon is the
 *      kind of helpfulness that loses their trust in the numbers.
 *
 *   2. **Forgotten timers are closed, not corrected.** Anything still running
 *      past the cap is closed AT the cap and marked `auto`, so it stands out
 *      as a number to check rather than dissolving into a plausible-looking
 *      total. Done on read and on write instead of by a background job: no
 *      scheduler to keep alive, and it cannot drift while the server is down.
 *
 *   3. **Permissions.** Writing time needs the same rights as writing a task.
 *      Reading it needs only membership — a viewer who cannot see where the
 *      week went is being kept in the dark for no reason.
 *
 * The figures are unrounded. They are here to show where the day went, not to
 * be invoiced, and a rounding rule would only make them less true.
 */
const timeRepo = require('./time.repo')
const logger = require('../../services/logger.service')

const sid = v => (v === undefined || v === null)?'':String(v)

function httpError(status, msg, extra){
    const err = new Error(msg)
    err.status = status
    if(extra) Object.assign(err, extra)
    return err
}

/** How long a forgotten timer may run before it is closed. */
const MAX_HOURS = Number(process.env.TIME_MAX_HOURS || 8)
const MAX_MS = Math.max(1, Number.isFinite(MAX_HOURS)?MAX_HOURS:8) * 60 * 60 * 1000

/** An interval shorter than this is a slip of the mouse, not work. */
const MIN_MS = 1000

const WRITE_ROLES = new Set(['owner', 'editor'])

/* --------------------------------------------------------- permissions -- */

async function roleFor(boardId, user){
    if(!user) return null
    if(user.isAdmin) return 'owner'
    return await timeRepo.roleOnBoard(boardId, user._id)
}

async function requireRead(boardId, user){
    const role = await roleFor(boardId, user)
    if(!role) throw httpError(404, 'Board not found')
    return role
}

async function requireWrite(boardId, user){
    const role = await roleFor(boardId, user)
    // A stranger gets 404, a viewer gets 403: one may not know the board
    // exists, the other already does.
    if(!role) throw httpError(404, 'Board not found')
    if(!WRITE_ROLES.has(role)) throw httpError(403, 'A viewer cannot record time')
    return role
}

/** Somebody else's entry may only be touched by an owner of that board. */
async function requireEntryWrite(entry, user){
    if(!entry) throw httpError(404, 'Entry not found')
    const role = await roleFor(entry.boardId, user)
    if(!role) throw httpError(404, 'Entry not found')
    if(sid(entry.userId) === sid(user._id)){
        if(!WRITE_ROLES.has(role)) throw httpError(403, 'A viewer cannot record time')
        return role
    }
    if(role !== 'owner') throw httpError(403, 'Only the owner of the board may change other people\'s entries')
    return role
}

/* ------------------------------------------------------------ the rules -- */

/**
 * Close everything that has outrun the cap.
 *
 * Everyone's, not just the caller's: there is at most one open row per person,
 * so this is a handful of rows, and a total that is only repaired for whoever
 * happens to click is worse than useless.
 */
async function closeStale(now = Date.now()){
    const running = await timeRepo.findAllRunning()
    const stale = running.filter(entry => now - entry.startedAt > MAX_MS)
    for(const entry of stale){
        await timeRepo.update(entry.id, {endedAt: entry.startedAt + MAX_MS, endedBy: 'auto'})
        logger.warn(`Timer closed automatically after ${MAX_HOURS}h: ${entry.id} (task ${entry.taskId})`)
    }
    return stale.length
}

/** What this person has open right now, with the task it belongs to. */
async function running(user){
    await closeStale()
    return await withTask(await timeRepo.findRunning(user._id))
}

/** Title and group alongside the entry, so the indicator can link to it. */
async function withTask(entry){
    if(!entry) return null
    const where = await timeRepo.taskLocation(entry.boardId, entry.taskId)
    return {...entry, taskTitle: where?where.title:'', groupId: where?where.groupId:null}
}

/**
 * Begin working on a task.
 *
 * With another timer already going this refuses with 409 and hands back what
 * is running, so the interface can ask. `resolve` is that answer coming back:
 * `{mode: 'pause' | 'stop', note, postUpdate}` closes the old one first.
 */
async function start(user, {boardId, taskId, resolve = null} = {}){
    if(!boardId || !taskId) throw httpError(400, 'boardId and taskId are required')
    await requireWrite(boardId, user)
    if(await timeRepo.taskLocation(boardId, taskId) === null) throw httpError(404, 'Task not found')

    await closeStale()
    const open = await timeRepo.findRunning(user._id)

    if(open){
        // Already counting this very task: say yes rather than start a second
        // interval. Two clicks on the same button is not two pieces of work.
        if(sid(open.boardId) === sid(boardId) && sid(open.taskId) === sid(taskId)) return open

        if(!resolve || !['pause', 'stop'].includes(resolve.mode)){
            throw httpError(409, 'Another timer is running', {
                code: 'ALREADY_RUNNING',
                running: await withTask(open)
            })
        }
        await close(user, {
            mode: resolve.mode, note: resolve.note,
            postUpdate: resolve.postUpdate, endedAt: resolve.endedAt
        })
    }

    return await timeRepo.insert({boardId, taskId, userId: user._id, startedAt: Date.now(), source: 'timer'})
}

/**
 * Stop counting.
 *
 * `mode` is 'pause' or 'stop'. Both close the interval — the row is the same
 * shape either way, and only the log and what the interface offers next tell
 * them apart. Deliberately: an interval that was paused and one that was
 * finished are the same fact about the same minutes.
 */
async function close(user, {mode = 'stop', note = '', postUpdate = false, endedAt = null} = {}){
    if(!['pause', 'stop'].includes(mode)) throw httpError(400, 'mode must be pause or stop')
    await closeStale()
    const open = await timeRepo.findRunning(user._id)
    if(!open) throw httpError(409, 'No timer is running')
    // Deliberately no permission check. Starting needed one; stopping cannot,
    // or somebody moved to viewer — or off the board — while their timer ran
    // would have no way to close it, and it would tick on until the cap.

    const text = String(note || '').trim()

    /**
     * The moment the button was pressed, not the moment the note was finished.
     *
     * Writing two sentences about what you did is not work on the task, and
     * counting it inflates every entry somebody bothered to describe — which
     * would punish exactly the people using the feature properly.
     *
     * The client sends that moment, and a client-sent timestamp is not
     * trusted: it is clamped into [startedAt, now]. Inside that window it can
     * only ever make an entry SHORTER, which is the only direction worth
     * allowing.
     */
    const now = Date.now()
    const asked = (endedAt === null || endedAt === undefined || endedAt === '')?NaN:Number(endedAt)
    const endedAtMs = Number.isFinite(asked)
        ?Math.min(now, Math.max(open.startedAt, asked))
        :now

    // Started and stopped by accident. Drop it rather than record a zero — an
    // empty row in the history is noise, and it hides nothing.
    if(endedAtMs - open.startedAt < MIN_MS && !text){
        await timeRepo.remove(open.id)
        return {removed: true, entry: null}
    }

    const entry = await timeRepo.update(open.id, {endedAt: endedAtMs, note: text, endedBy: mode})
    if(postUpdate && text) await postAsUpdate(user, entry)
    return {removed: false, entry}
}

/* -------------------------------------------------- corrections by hand -- */

function checkSpan(startedAt, endedAt){
    const from = Number(startedAt)
    const to = Number(endedAt)
    if(!Number.isFinite(from) || !Number.isFinite(to)) throw httpError(400, 'Start and end must be timestamps')
    if(to <= from) throw httpError(400, 'The end must come after the start')
    if(to - from > MAX_MS) throw httpError(400, `An entry cannot be longer than ${MAX_HOURS} hours`)
    if(from > Date.now() + 60 * 1000) throw httpError(400, 'An entry cannot start in the future')
    return {from, to}
}

/** An interval typed in afterwards, because somebody forgot to press start. */
async function addManual(user, {boardId, taskId, startedAt, endedAt, note = '', postUpdate = false} = {}){
    if(!boardId || !taskId) throw httpError(400, 'boardId and taskId are required')
    await requireWrite(boardId, user)
    if(await timeRepo.taskLocation(boardId, taskId) === null) throw httpError(404, 'Task not found')
    const {from, to} = checkSpan(startedAt, endedAt)
    const entry = await timeRepo.insert({
        boardId, taskId, userId: user._id,
        startedAt: from, endedAt: to,
        note: String(note || '').trim(), source: 'manual', endedBy: 'stop'
    })
    if(postUpdate && entry.note) await postAsUpdate(user, entry)
    return entry
}

async function edit(user, id, patch = {}){
    const entry = await timeRepo.findById(id)
    await requireEntryWrite(entry, user)
    if(entry.endedAt === null) throw httpError(409, 'A running timer cannot be edited — stop it first')

    const startedAt = patch.startedAt === undefined?entry.startedAt:patch.startedAt
    const endedAt = patch.endedAt === undefined?entry.endedAt:patch.endedAt
    const {from, to} = checkSpan(startedAt, endedAt)

    return await timeRepo.update(id, {
        startedAt: from,
        endedAt: to,
        note: patch.note === undefined?undefined:String(patch.note || '').trim(),
        // A corrected entry is no longer the machine's word for it.
        endedBy: entry.endedBy === 'auto'?'stop':undefined
    })
}

async function remove(user, id){
    const entry = await timeRepo.findById(id)
    await requireEntryWrite(entry, user)
    await timeRepo.remove(id)
    return {removed: true}
}

/* ------------------------------------------------------------- reading -- */

async function forTask(user, boardId, taskId){
    await requireRead(boardId, user)
    await closeStale()
    const entries = await timeRepo.findForTask(boardId, taskId)
    const total = entries.reduce((sum, e) => sum + (e.endedAt?e.endedAt - e.startedAt:0), 0)
    const byUser = {}
    for(const e of entries){
        if(!e.endedAt) continue
        byUser[e.userId] = (byUser[e.userId] || 0) + (e.endedAt - e.startedAt)
    }
    return {entries, total, byUser}
}

async function totalsForBoard(user, boardId){
    await requireRead(boardId, user)
    await closeStale()
    return await timeRepo.totalsForBoard(boardId)
}

/* ------------------------------------------- the note as a task update -- */

/**
 * Post the note as an update on the task.
 *
 * Goes through the ordinary task write rather than inserting a comment row, so
 * that subscribers get their notification and the other browsers get their
 * push — the same as if the text had been typed into the update box, which is
 * exactly what it is.
 *
 * Required late: board.service pulls in most of the backend, and a timer that
 * ticks should not drag that graph in until somebody actually ticks the box.
 */
async function postAsUpdate(user, entry){
    try {
        const boardService = require('../board/board.service')
        const board = await boardService.getById(entry.boardId)
        const group = (board.groups || []).find(g => (g.tasks || []).some(t => sid(t.id) === sid(entry.taskId)))
        if(!group) return
        const task = group.tasks.find(t => sid(t.id) === sid(entry.taskId))

        const comment = {
            id: timeRepo.newId(),
            parentId: null,
            txt: entry.note,
            archivedAt: Date.now(),
            byMember: {_id: sid(user._id), fullname: user.fullname || '', imgUrl: user.imgUrl || ''},
            // Where this text came from. The duration is NOT copied here — it
            // is read from the entry when the board is read, so correcting the
            // entry later corrects what this update shows. See the migration
            // 20260821_000032 for why that matters.
            timeId: sid(entry.id)
        }
        await boardService.updateTaskFields(entry.boardId, group.id, entry.taskId, {
            comments: [comment, ...(task.comments || [])]
        })
    } catch(err){
        // The time was recorded; the update is the extra. Losing the extra must
        // not lose the minutes, so this is logged and swallowed.
        logger.error('Could not post the time note as an update', err)
    }
}

module.exports = {
    start, close, running,
    addManual, edit, remove,
    forTask, totalsForBoard,
    closeStale,
    MAX_MS, MAX_HOURS
}
