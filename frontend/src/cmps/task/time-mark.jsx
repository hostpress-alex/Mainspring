import {Tooltip} from '@mui/material'

import {useBoardTotals} from '../time/use-board-totals'
import {progressOf} from '../../services/task-progress'
import {formatDuration} from '../../services/time.service'
import {fieldOf} from '../board/column-value'
import {t} from '../../i18n'

/**
 * How much of a task's estimate has been worked, as one circle.
 *
 * **A filled circle, and here that is the right shape.** The board already
 * uses it twice and both times it means time — `cal-event-ring` for exactly
 * this, `due-dot` for how much of the run-up to a deadline is gone. This is a
 * third one saying the same kind of thing, so it says it the same way. The
 * checklist mark next to it is a stroked ring with a tick precisely because it
 * is NOT time.
 *
 * Nothing is drawn until there is something to compare: a task with an
 * estimate and no recorded time is not "0 % done", it is an estimate, and a
 * task with time but no estimate has no fraction to show at all. Both are
 * `progressOf` returning null or a null `fill`.
 *
 * The totals come from `useBoardTotals`, which is one request per board no
 * matter how many cards ask — see that file.
 */
export function TimeMark({board, task}){
    const totals = useBoardTotals(board?._id)

    const column = (board?.columns || []).find(col => col && col.type === 'estimate')
    const estimateMinutes = column?Number(task[fieldOf(column)]):null
    const progress = progressOf({spentMs: Number(totals[task.id]) || 0, estimateMinutes})
    if(!progress || progress.fill === null) return null

    return (
        <Tooltip arrow title={progress.isOver
            ?t('calendar.spentOver', {
                spent: formatDuration(progress.spentMs),
                estimate: formatDuration(progress.estimateMs)
            })
            :t('calendar.spentOf', {
                spent: formatDuration(progress.spentMs),
                estimate: formatDuration(progress.estimateMs)
            })}>
            <span className={`time-mark${progress.isOver?' is-over':''}`}
                // A sliver rather than nothing: half a minute against four
                // hours rounds to 0 % and draws an empty circle, which says
                // "nothing recorded" — the one thing it is not. Same floor the
                // calendar ring uses.
                style={{'--fill': `${Math.max(2, Math.round(progress.fill * 100))}%`}}/>
        </Tooltip>
    )
}
