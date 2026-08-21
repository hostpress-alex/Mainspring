import {Icon} from '../icon'
import {formatDuration} from '../../services/time.service'
import {t} from '../../i18n'

/**
 * The two things a block says about its task besides its name: whether the
 * timer is running on it, and how much has been recorded against it.
 *
 * One component for the week grid and the month chips, because they are the
 * same statement and would otherwise drift into two.
 *
 * The ring is the estimate burned down — recorded time over the task's
 * estimate. It is the same on every block of one task, and that is correct:
 * time is recorded against the task, not against the block it happened in.
 * A time entry does not know which reservation it fell into, so "how much of
 * THIS block did I work" is a question the data cannot answer, and a ring that
 * implied it could would be worse than no ring.
 *
 * A task with recorded time and no estimate gets the number and no ring: the
 * time is real, the ratio would be invented.
 */
export function EntryMarks({info}){
    if(!info) return null
    const {progress, isRunning} = info
    if(!isRunning && !progress) return null

    return (
        <span className="cal-event-marks">
            {isRunning && (
                <span className="cal-event-running" title={t('calendar.timerHere')}>
                    <Icon name="stopwatch"/>
                </span>
            )}
            {progress && progress.fill !== null && (
                <span className={`cal-event-ring${progress.isOver?' is-over':''}`}
                    // A sliver rather than nothing. Half a minute against a
                    // four-hour estimate rounds to 0% and draws an empty
                    // circle, which says "nothing recorded" — the one thing it
                    // is not. Two per cent is the smallest wedge that is
                    // visible at eleven pixels.
                    style={{'--fill': `${Math.max(2, Math.round(progress.fill * 100))}%`}}
                    title={progress.isOver
                        ?t('calendar.spentOver', {
                            spent: formatDuration(progress.spentMs),
                            estimate: formatDuration(progress.estimateMs)
                        })
                        :t('calendar.spentOf', {
                            spent: formatDuration(progress.spentMs),
                            estimate: formatDuration(progress.estimateMs)
                        })}/>
            )}
            {progress && progress.fill === null && (
                <span className="cal-event-spent"
                    title={t('calendar.spentOnly', {spent: formatDuration(progress.spentMs)})}>
                    {formatDuration(progress.spentMs)}
                </span>
            )}
        </span>
    )
}
