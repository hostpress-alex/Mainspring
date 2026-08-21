import {fieldOf} from '../cmps/board/column-value'

/**
 * How far a task has burned through its estimate.
 *
 * Two numbers meet here that are stored in different units and in different
 * places, which is the only reason this is a file and not an expression:
 * the estimate is MINUTES in a board column, the recorded time is
 * MILLISECONDS from the time endpoint. Getting that wrong is off by sixty,
 * which looks plausible on both sides of the mistake.
 *
 * Keyed `boardId:taskId` throughout. Task ids are only unique within their
 * board, and the calendar is the one place in this application where tasks
 * from several boards sit in the same list — keying by task id alone would
 * show one board's hours on another board's task.
 */

export const taskKey = (boardId, taskId) => `${boardId}:${taskId}`

/**
 * Every task's estimate, in minutes, from boards that have such a column.
 *
 * A board with no estimate column contributes nothing rather than zeros: "no
 * estimate" and "estimated at nothing" are different answers and only one of
 * them may draw a full ring.
 */
export function estimatesFromBoards(boards = []){
    const out = {}
    for(const board of boards){
        const columns = (board.columns || []).filter(c => c && c.type === 'estimate')
        if(!columns.length) continue
        for(const group of board.groups || []){
            for(const task of group.tasks || []){
                for(const column of columns){
                    const minutes = Number(task[fieldOf(column)])
                    if(!Number.isFinite(minutes) || minutes <= 0) continue
                    out[taskKey(board._id, task.id)] = minutes
                    break
                }
            }
        }
    }
    return out
}

/**
 * What to draw for one task: `null` when there is nothing honest to draw.
 *
 * - no recorded time at all -> null. An empty ring on every block is noise.
 * - time but no estimate    -> `{spentMs, fill: null}`. The number is real,
 *                              the ratio is not; the caller shows one and not
 *                              the other rather than inventing a denominator.
 * - both                    -> `fill` between 0 and 1, and `isOver` when the
 *                              estimate has been passed. Capped at 1, because
 *                              a circle that is more than full is not a thing
 *                              — going over is said with colour instead.
 */
export function progressOf({spentMs, estimateMinutes}){
    const spent = Number(spentMs)
    if(!Number.isFinite(spent) || spent <= 0) return null
    const minutes = Number(estimateMinutes)
    if(!Number.isFinite(minutes) || minutes <= 0) return {spentMs: spent, fill: null, isOver: false}
    const estimateMs = minutes * 60000
    return {
        spentMs: spent,
        fill: Math.min(1, spent / estimateMs),
        isOver: spent > estimateMs,
        estimateMs
    }
}
