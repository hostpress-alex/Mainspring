import {useState} from 'react'
import {useLocation, useNavigate, useSearchParams} from 'react-router-dom'
import {Icon} from '../icon'
import {t} from '../../i18n'
import {withTaskParams} from '../../services/task-link'
import {timeService, formatClock} from '../../services/time.service'
import {useRunningTimer, useRunningSpan, setRunning, refreshRunning, notifyTimesChanged} from './use-running-timer'
import {TimeNoteDialog} from './time-note-dialog'

/**
 * The one place that always says what is running.
 *
 * A timer you have to go and find is a timer that runs all night. This sits in
 * the sidebar, which is on every page including the ones that have nothing to
 * do with boards — the calendar and the profile are exactly where somebody
 * ends up when they have stopped working and not noticed.
 *
 * Renders nothing at all when nothing is running. A permanent empty slot
 * teaches people to stop looking at it.
 */
export function RunningTimer(){
    const running = useRunningTimer()
    const [dialog, setDialog] = useState(null)
    const navigate = useNavigate()
    const location = useLocation()
    const [searchParams] = useSearchParams()

    const elapsed = useRunningSpan(running)

    if(!running) return null

    /**
     * Straight to the task, and without leaving the page.
     *
     * This sits in the sidebar, so it is clicked from the calendar and the
     * profile as often as from a board — the two places where being thrown
     * onto a board is most jarring. The running entry carries its group; the
     * server sends it along, so this does not have to go looking for a board
     * it may not have loaded.
     */
    function onOpenTask(){
        if(!running.groupId){
            navigate(`/board/${running.boardId}`)
            return
        }
        navigate({
            pathname: location.pathname,
            search: `?${withTaskParams(searchParams, running).toString()}`
        })
    }

    async function onConfirm({mode, note, postUpdate, endedAt}){
        try {
            await timeService.close({mode, note, postUpdate, endedAt})
            setRunning(null)
            notifyTimesChanged()
        } catch(err){
            console.error('could not stop the timer', err)
            await refreshRunning()
        } finally {
            setDialog(null)
        }
    }

    return (
        <div className="running-timer">
            <button type="button" className="running-timer-open"
                title={t('time.goToTask', {task: running.taskTitle || ''})}
                onClick={onOpenTask}>
                <Icon name="stopwatch" className="icon"/>
                <span className="running-timer-clock">{formatClock(elapsed)}</span>
            </button>
            <div className="running-timer-actions">
                <button type="button" title={t('time.pause')} onClick={() => setDialog('pause')}>
                    <Icon name="pause" className="icon"/>
                </button>
                <button type="button" title={t('time.stop')} onClick={() => setDialog('stop')}>
                    <Icon name="stop" className="icon"/>
                </button>
            </div>

            {dialog && <TimeNoteDialog
                mode={dialog}
                entry={running}
                taskTitle={running.taskTitle || ''}
                onCancel={() => setDialog(null)}
                onConfirm={onConfirm}/>}
        </div>
    )
}
