/**
 * Planning somebody's next weeks.
 *
 * Two ways in, and the difference is the whole point of having both:
 *
 *   preview  — works everything out and writes nothing. What the calendar
 *              would look like, plus what does not fit.
 *   run      — the same, and then replaces the planner's own blocks.
 *
 * A planner that can only be tried by letting it loose is one nobody dares
 * press. So the expensive half is shared and only the last step differs.
 */
const plannerRepo = require('./planner.repo')
const workHoursRepo = require('../workhours/workhours.repo')
const {plan, HORIZON_DAYS, DEFAULT_TASK_MIN, addDays, startOfDay, daysLeftInWeek} = require('./planner.core')
const logger = require('../../services/logger.service')

/** Told, not sent: the calendar fetches the new week itself. */
const sockets = () => require('../../services/socket.service')
const PLAN_CHANGED = 'plan-changed'

function fail(status, message){
    const err = new Error(message)
    err.status = status
    return err
}

/**
 * Work out the plan without touching anything.
 *
 * `from` exists for the tests and for "plan tomorrow morning" later on; every
 * ordinary call uses now.
 */
/**
 * How many days a run covers.
 *
 * 'week' is what the button uses: this week and no further. Anything that
 * does not fit is left for next week's plan rather than parked on a Monday
 * three weeks out, where it blocks the calendar and nobody looks.
 */
function horizonFor(from, scope, horizonDays){
    return scope === 'week'?daysLeftInWeek(from):horizonDays
}

async function preview(userId, {from = Date.now(), scope = 'week', horizonDays = HORIZON_DAYS} = {}){
    if(!userId) throw fail(400, 'Who for?')

    const days = horizonFor(from, scope, horizonDays)
    const to = addDays(startOfDay(from), days + 1)
    const [workHours, busy, {tasks, skipped}] = await Promise.all([
        workHoursRepo.findForUser(userId),
        plannerRepo.busyFor(userId, from, to),
        plannerRepo.candidatesFor(userId)
    ])

    // Nothing to plan into. Said plainly rather than returning an empty plan
    // that looks like "there is no work".
    if(!workHours.length){
        return {
            blocks: [], unplaced: tasks.map(task => ({
                taskId: task.taskId, title: task.title,
                remainingMin: task.remainingMin, reason: 'noWorkHours'
            })),
            skipped, assumedCount: 0, taskCount: tasks.length, workHours, from, to, scope, days
        }
    }

    const result = plan({tasks, workHours, busy, from, horizonDays: days})

    // The blocks carry only ids; the calendar shows names. Filled in here so
    // the same list can be written to the database and shown on screen.
    const byId = new Map(tasks.map(task => [task.taskId, task]))
    const blocks = result.blocks.map(block => {
        const task = byId.get(block.taskId) || {}
        return {
            ...block,
            boardTitle: task.boardTitle || '',
            groupTitle: task.groupTitle || '',
            color: task.color || block.color || ''
        }
    })

    return {...result, blocks, skipped, taskCount: tasks.length, workHours, from, to, scope, days}
}

/** Plan, and write it. Returns the same report as preview. */
async function run(userId, options = {}){
    const result = await preview(userId, options)
    await plannerRepo.replaceAuto(userId, result.from, result.blocks)

    try {
        sockets().emitToUser({type: PLAN_CHANGED, data: {at: Date.now()}, userId: String(userId)})
    } catch(err) {
        logger.error('could not announce the new plan', err)
    }
    return result
}

/**
 * Plan for several people, one after another.
 *
 * Used by the triggers. Never in parallel: they share a database and nothing
 * about this is urgent enough to hold fifteen transactions open.
 */
async function runFor(userIds){
    const out = []
    for(const userId of [...new Set((userIds || []).map(String).filter(Boolean))]){
        try {
            const result = await run(userId)
            out.push({userId, blocks: result.blocks.length, unplaced: result.unplaced.length})
        } catch(err) {
            logger.error(`planning failed for ${userId}`, err)
            out.push({userId, error: err.message})
        }
    }
    return out
}

module.exports = {preview, run, runFor, DEFAULT_TASK_MIN, HORIZON_DAYS}
