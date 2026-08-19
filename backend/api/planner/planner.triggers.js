/**
 * When the plan is redone by itself.
 *
 * Three rules, and two of them are about NOT doing it:
 *
 *   1. Only when something the plan depends on has changed. A renamed task or
 *      a new comment is not that; a deadline, an estimate, a priority, a
 *      status or who it belongs to is.
 *   2. Never while that person has a timer running. Somebody who is working
 *      right now is the last person whose calendar should rearrange itself
 *      under them — the next change, or their own button, will do it.
 *   3. Never for the past. That is not decided here: `replaceAuto` only ever
 *      removes blocks that have not begun, and blocks that have begun count
 *      as busy. Together those two mean a re-plan cannot rewrite the hour
 *      anybody is in.
 *
 * Everything is collected for a few seconds first. Dragging a task through
 * four statuses in ten seconds is one change to react to, not four — and a
 * planner that runs four times leaves three plans nobody ever saw.
 */
const logger = require('../../services/logger.service')

/** Late, because planner.service reaches the board layer through the repo. */
const planner = () => require('./planner.service')
const timeRepo = () => require('../time/time.repo')

/** How long changes are collected before the plan is redone. */
const DELAY_MS = 5000

/** Column types whose value the plan is built on. */
const RELEVANT_TYPES = new Set(['deadline', 'estimate', 'priority', 'status'])

const pending = new Set()
let timer = null

/**
 * Does this patch touch anything the plan depends on?
 *
 * The board's own columns decide it: which key holds a deadline differs per
 * board, so the patch is compared against the columns rather than against a
 * list of names.
 */
function isRelevant(board, patch){
    if(!patch || typeof patch !== 'object') return false
    // Who a task belongs to changes whose plan it is.
    if(Object.prototype.hasOwnProperty.call(patch, 'memberIds')) return true

    const fields = new Set((board && board.columns || [])
        .filter(column => column && RELEVANT_TYPES.has(column.type))
        .map(column => column.field || column.id))
    return Object.keys(patch).some(key => fields.has(key))
}

/** Everybody whose plan this change could move: before and after. */
function affectedUsers(oldTask, patch){
    const before = Array.isArray(oldTask && oldTask.memberIds)?oldTask.memberIds:[]
    const after = Array.isArray(patch && patch.memberIds)?patch.memberIds:[]
    return [...new Set([...before, ...after].map(String).filter(Boolean))]
}

async function flush(){
    timer = null
    const ids = [...pending]
    pending.clear()

    for(const userId of ids){
        try {
            const running = await timeRepo().findRunning(userId)
            if(running){
                logger.info(`plan for ${userId} left alone: a timer is running`)
                continue
            }
            await planner().run(userId)
        } catch(err) {
            // Commentary on somebody else's write. It must never travel back.
            logger.error(`automatic planning failed for ${userId}`, err)
        }
    }
}

/** Collect these people for the next run. */
function replanSoon(userIds){
    for(const id of (userIds || []).map(String).filter(Boolean)) pending.add(id)
    if(!pending.size || timer) return
    timer = setTimeout(() => {
        flush().catch(err => logger.error('automatic planning failed', err))
    }, DELAY_MS)
    // Never a reason to keep the process alive.
    if(timer.unref) timer.unref()
}

/** A task was patched. Called from board.service, and never awaited. */
function onTaskChanged({board, oldTask, patch}){
    try {
        if(!isRelevant(board, patch)) return
        replanSoon(affectedUsers(oldTask, patch))
    } catch(err) {
        logger.error('could not queue the planning', err)
    }
}

/** A task was created. Only interesting once it belongs to somebody. */
function onTaskAdded({task}){
    try {
        replanSoon(Array.isArray(task && task.memberIds)?task.memberIds:[])
    } catch(err) {
        logger.error('could not queue the planning', err)
    }
}

/** Their outside calendar moved, so what is free moved with it. */
function onCalendarSynced(userId){
    try {
        replanSoon([userId])
    } catch(err) {
        logger.error('could not queue the planning', err)
    }
}

module.exports = {
    onTaskChanged, onTaskAdded, onCalendarSynced, replanSoon,
    // exported for the tests
    isRelevant, affectedUsers, DELAY_MS
}
