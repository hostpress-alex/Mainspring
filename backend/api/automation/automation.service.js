/**
 * Automations: writing the rules, and running them.
 *
 * ## Why this is in the backend
 *
 * A rule has to fire whatever caused the change — this browser, another
 * person's browser, the socket, a script. In the frontend it would fire once
 * per open tab, or not at all when nobody is looking.
 *
 * ## The loop
 *
 * The interesting failure is not a rule that does not run, it is a rule that
 * runs forever. "Status Erledigt → Gruppe Erledigt" and "Gruppe Erledigt →
 * Status Erledigt" are two reasonable rules that together never stop, and each
 * turn writes to the database, wakes every connected client and adds an
 * activity. Three separate things stop that:
 *
 *   1. A rule whose actions change nothing does not write. `engine.plan` marks
 *      those `unchanged`, and no write means no event means no next round. This
 *      is the one that catches the ordinary case.
 *   2. A rule fires at most once per chain. The set of rules already fired
 *      travels along in the async context.
 *   3. A chain is at most MAX_DEPTH deep. The backstop for anything the first
 *      two do not see, including a cycle spread over several rules.
 *
 * All three are recorded in the run log when they bite, because "my rule did
 * not fire" has to have an answer.
 *
 * ## Why it waits a second
 *
 * A rule does not run inside the write that started it. The write answers
 * first, then the rule runs a second later, and the board pushes the result to
 * everyone looking at it.
 *
 * The delay is for the person watching: a status set by hand and a group
 * changed by a rule arriving in the same repaint look like one thing the
 * application did, and when it is wrong there is no way to tell which half was
 * yours. A beat between them makes the rule visible as a rule.
 *
 * It has a price, and the price is the socket push below. Once the rule runs
 * after the response, nobody is waiting for its result — the browser that
 * saved has already drawn the answer it got. Without the server saying so, the
 * change would sit in the database until somebody reloaded.
 *
 * ## Whose rights
 *
 * A rule runs as the person who wrote it, not as whoever tripped it. A viewer
 * may set nothing, but a viewer changing a comment can still trip a rule that
 * moves the task — and that must be allowed, because an owner said so when
 * they wrote the rule. That is also why the interface shows a face next to
 * every rule: it says whose hand the board is acting with.
 */
const asyncLocalStorage = require('../../services/als.service')
const logger = require('../../services/logger.service')
const automationRepo = require('./automation.repo')
const boardRepo = require('../board/board.repo')
const userRepo = require('../user/user.repo')
const roles = require('../board/board.roles')
const engine = require('./automation.engine')

// Lazily, because board.service requires this file back. See the same trick
// at the top of board.service.js.
const boards = () => require('../board/board.service')
const sockets = () => require('../../services/socket.service')
const notifications = () => require('../notification/notification.service')

/** How many rules may follow one another before the chain is cut. */
const MAX_DEPTH = 3

/**
 * How long a rule waits before it runs.
 *
 * Configurable only so the tests can take it away; there is no reason to
 * change it in production, and a second is short enough that nobody waits for
 * it and long enough to be seen as a separate event.
 */
const DELAY_MS = Number(process.env.AUTOMATION_DELAY_MS ?? 1000)

/**
 * Everything scheduled and not yet finished.
 *
 * Only the tests read this — through `settle()`. Without it a test would have
 * to sleep and hope, which is how a suite starts failing on a busy machine and
 * nowhere else.
 */
const pending = new Set()

const sid = v => (v === undefined || v === null)?'':String(v)

function httpError(status, msg){
    const err = new Error(msg)
    err.status = status
    return err
}

function getLoggedinUser(){
    const store = asyncLocalStorage.getStore()
    return (store && store.loggedinUser) || null
}

/** Where we are in a chain of rules. Empty outside one. */
function chainState(){
    const store = asyncLocalStorage.getStore()
    return (store && store.automation) || {depth: 0, fired: []}
}

/* --------------------------------------------------------------- rules -- */

async function _requireOwnedBoard(boardId){
    const board = await boardRepo.findById(boardId)
    if(!board) throw httpError(404, 'Board nicht gefunden')
    if(!roles.isOwner(board, getLoggedinUser())){
        throw httpError(403, 'Nur Owner duerfen Automatisierungen verwalten')
    }
    return board
}

async function list(boardId){
    await _requireOwnedBoard(boardId)
    return await automationRepo.findByBoard(boardId)
}

async function runs(boardId, limit){
    await _requireOwnedBoard(boardId)
    return await automationRepo.findRuns(boardId, limit)
}

async function create(boardId, automation){
    const board = await _requireOwnedBoard(boardId)
    const problems = engine.validate(automation, board)
    if(problems.length) throw httpError(400, problems.join('; '))

    return await automationRepo.insert({
        boardId,
        trigger: automation.trigger,
        actions: automation.actions,
        enabled: automation.enabled !== false,
        createdBy: sid(getLoggedinUser() && getLoggedinUser()._id)
    })
}

async function update(id, patch){
    const existing = await automationRepo.findById(id)
    if(!existing) throw httpError(404, 'Automatisierung nicht gefunden')
    const board = await _requireOwnedBoard(existing.boardId)

    // Only the switch was flipped: nothing to check against the board.
    const isOnlyToggle = patch && typeof patch.enabled === 'boolean'
        && !patch.trigger && !patch.actions
    if(!isOnlyToggle){
        const merged = {
            trigger: patch.trigger || existing.trigger,
            actions: patch.actions || existing.actions
        }
        const problems = engine.validate(merged, board)
        if(problems.length) throw httpError(400, problems.join('; '))
    }
    return await automationRepo.update(id, patch)
}

async function remove(id){
    const existing = await automationRepo.findById(id)
    if(!existing) return
    await _requireOwnedBoard(existing.boardId)
    await automationRepo.deleteById(id)
}

/* --------------------------------------------------------------- firing -- */

/**
 * Something happened to a task. Run whatever it started.
 *
 * Never throws. This hangs off a write that has already succeeded, and a
 * broken rule must not turn a saved task into an error message — the task is
 * saved either way, and the failure belongs in the log where the rule's author
 * will look for it.
 */
function fire(event){
    if(!event || !event.board || !event.board._id) return

    // Deliberately not awaited by the caller: the write that started this has
    // a person waiting on it, and a rule is not part of that answer.
    const scheduled = new Promise(resolve => {
        setTimeout(() => {
            runChain(event).catch(err => logger.error('automations failed', err)).then(resolve, resolve)
        }, DELAY_MS)
    })
    pending.add(scheduled)
    scheduled.then(() => pending.delete(scheduled))
}

/** Wait for everything scheduled, including what it schedules in turn. Tests only. */
async function settle(){
    while(pending.size) await Promise.all([...pending])
}

async function runChain(event){
    try {
        const board = event.board
        if(!board || !board._id) return
        const wanted = event.kind === 'created'
            ?[engine.TRIGGERS.ITEM_CREATED]
            :[engine.TRIGGERS.STATUS_CHANGES_TO, engine.TRIGGERS.COLUMN_CHANGES]

        const lists = await Promise.all(wanted.map(type => automationRepo.findLive(board._id, type)))
        const rules = lists.flat()
        if(!rules.length) return

        for(const rule of rules){
            if(!engine.matches(rule, event)) continue
            await runOne(rule, event)
        }
    } catch(err) {
        logger.error('automations failed', err)
    }
}

async function runOne(rule, event){
    const board = event.board
    const task = event.task || {}
    const base = {
        boardId: sid(board._id), automationId: rule.id,
        taskId: sid(task.id), taskTitle: task.title || ''
    }
    const {depth, fired} = chainState()

    if(fired.includes(rule.id)){
        return await automationRepo.addRun({...base, outcome: 'skipped',
            summary: 'Already ran in this chain'})
    }
    if(depth >= MAX_DEPTH){
        return await automationRepo.addRun({...base, outcome: 'skipped',
            summary: `Chain longer than ${MAX_DEPTH} rules`})
    }

    const planned = engine.plan(rule, event)
    const todo = planned.filter(step => !step.skip)
    if(!todo.length){
        return await automationRepo.addRun({...base, outcome: 'skipped',
            summary: 'Nothing left to change'})
    }

    // The rule's author, not whoever tripped it. Without a reachable author
    // the rule stops rather than borrowing somebody else's rights.
    const author = rule.createdBy?await userRepo.findById(rule.createdBy):null
    if(!author){
        return await automationRepo.addRun({...base, outcome: 'failed',
            summary: 'The person this rule belongs to no longer exists'})
    }

    const store = asyncLocalStorage.getStore() || {}
    const next = {...store, loggedinUser: author,
        automation: {depth: depth + 1, fired: [...fired, rule.id]}}

    try {
        const {done, fresh} = await asyncLocalStorage.run(next, () => apply(todo, event))
        await automationRepo.addRun({...base, outcome: 'done',
            summary: done.map(a => engine.describeAction(a, board)).join(' · ')})

        // Tell everyone looking. Nobody is waiting for this answer any more —
        // the request that started it was answered a second ago.
        if(fresh){
            sockets().emitToBoard({
                type: 'board-add-update', boardId: base.boardId, args: [fresh, fresh]})
        }
    } catch(err) {
        logger.error(`automation ${rule.id} failed`, err)
        await automationRepo.addRun({...base, outcome: 'failed',
            summary: (err && err.message) || 'Unknown error'})
    }
}

/**
 * Carry out the steps, in order.
 *
 * `groupId` is tracked as it goes: after a move the task is somewhere else,
 * and a later step in the same rule that still used the old group would write
 * into a group the task has left.
 */
async function apply(steps, event){
    const board = event.board
    const boardId = sid(board._id)
    const task = event.task || {}
    let groupId = sid(event.groupId)
    const done = []
    // The board as it stands after the last write, so the push below does not
    // have to read it back.
    let fresh = null

    for(const {action} of steps){
        switch(action.type){
            case engine.ACTIONS.SET_VALUE:
                fresh = await boards().updateTaskFields(boardId, groupId, sid(task.id),
                    {[action.field]: action.value})
                break

            case engine.ACTIONS.MOVE_TO_GROUP:
                fresh = await boards().moveTask(boardId, groupId, sid(action.groupId), sid(task.id))
                groupId = sid(action.groupId)
                break

            case engine.ACTIONS.NOTIFY:
                await notifications().automationFired({
                    board, groupId, taskId: sid(task.id), subject: task.title || '',
                    userIds: engine.recipientsOf(action, task),
                    summary: engine.describeAction(action, board)
                })
                break

            default:
                continue
        }
        done.push(action)
    }
    return {done, fresh}
}

module.exports = {
    MAX_DEPTH,
    DELAY_MS,
    list, runs, create, update, remove,
    fire,
    // Exported for the tests: wait for what has been scheduled.
    settle
}
