import {httpService} from './http.service'

/**
 * The automatic calendar, from the browser's side.
 *
 * Two calls that do the same work and differ in one thing: whether the result
 * is written. `preview` exists so that pressing the button is not the only
 * way to find out what it would do — and so that a first look at somebody
 * else's week (as an admin) cannot change it.
 */

const BASE = 'planner/'

/** Work out a plan and write nothing. */
export function previewPlan(userId){
    return httpService.post(BASE + (userId?`preview/${userId}`:'preview'), {})
}

/** Work out a plan and replace the planner's own blocks with it. */
export function runPlan(userId){
    return httpService.post(BASE + (userId?`run/${userId}`:'run'), {})
}

/**
 * Why a task did not make it into the plan, in one word.
 *
 * The reasons are deliberately kept apart rather than folded into "did not
 * fit": each one is a different thing to do about it. A missing duration is a
 * task to fill in, a deadline that cannot be met is a conversation, and a
 * full week is neither.
 */
export const SKIP_REASONS = ['done', 'hasSubtasks', 'alreadyWorked', 'alreadyPlanned']
export const UNPLACED_REASONS = ['deadline', 'horizon', 'noWorkHours']
