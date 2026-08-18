import {useState} from 'react'
import {Icon} from '../icon'
import {t} from '../../i18n'
import {timeService, readRunningConflict, formatClock, formatDuration} from '../../services/time.service'
import {useRunningTimer, useRunningSpan, setRunning, refreshRunning, notifyTimesChanged} from './use-running-timer'
import {TimeNoteDialog} from './time-note-dialog'

/**
 * Start, pause and stop, on one task.
 *
 * Three states and nothing else: not running, running here, running somewhere
 * else. The third is the interesting one — pressing start there does not
 * quietly take the other timer away, it asks, because whether the last forty
 * minutes were a pause or the end of that piece of work is not something this
 * button can know.
 *
 * Lives in the task's header. It used to sit in the board row as well; a row
 * is a place to see that something is running, not a place to operate it —
 * see TaskRunningDot below.
 */
export function TaskTimerControls({board, task, total = 0, withTotal = true}){
    const running = useRunningTimer()
    const [dialog, setDialog] = useState(null)
    const [busy, setBusy] = useState(false)

    const boardId = board?._id
    const taskId = task?.id
    const isHere = runsHere(running, boardId, taskId)
    const elapsed = useRunningSpan(isHere?running:null)

    async function onStart(ev){
        stop(ev)
        if(busy) return
        setBusy(true)
        try {
            const {entry} = await timeService.start(boardId, taskId)
            setRunning({...entry, taskTitle: task.title || ''})
            notifyTimesChanged()
        } catch(err){
            const other = readRunningConflict(err)
            // Not a failure — a question. The dialog answers it and the same
            // call goes out again with the answer attached.
            if(other) setDialog({mode: 'switch', entry: other})
            else console.error('timer start failed', err)
        } finally {
            setBusy(false)
        }
    }

    function onAsk(ev, mode){
        stop(ev)
        setDialog({mode, entry: running})
    }

    async function onConfirm({mode, note, postUpdate, endedAt}){
        try {
            if(dialog.mode === 'switch'){
                const {entry} = await timeService.start(boardId, taskId, {mode, note, postUpdate, endedAt})
                setRunning({...entry, taskTitle: task.title || ''})
            } else {
                await timeService.close({mode, note, postUpdate, endedAt})
                setRunning(null)
            }
            notifyTimesChanged()
        } catch(err){
            console.error('timer change failed', err)
            await refreshRunning()
        } finally {
            setDialog(null)
        }
    }

    return (
        <span className={`task-timer${isHere?' is-running':''}`} onClick={stop}>
            {isHere
                ?<>
                    <span className="task-timer-clock" title={t('time.runningSince')}>{formatClock(elapsed)}</span>
                    <button type="button" className="task-timer-btn" title={t('time.pause')}
                        onClick={ev => onAsk(ev, 'pause')} disabled={busy}>
                        <Icon name="pause" className="icon"/>
                    </button>
                    <button type="button" className="task-timer-btn is-stop" title={t('time.stop')}
                        onClick={ev => onAsk(ev, 'stop')} disabled={busy}>
                        <Icon name="stop" className="icon"/>
                    </button>
                </>
                :<>
                    <button type="button" className="task-timer-btn is-start" title={t('time.start')}
                        onClick={onStart} disabled={busy}>
                        <Icon name="play" className="icon"/>
                    </button>
                    {withTotal && total > 0 && <span className="task-timer-total" title={t('time.totalTitle')}>
                        {formatDuration(total)}
                    </span>}
                </>}

            {dialog && <TimeNoteDialog
                mode={dialog.mode}
                entry={dialog.entry}
                taskTitle={dialog.mode === 'switch'?(dialog.entry?.taskTitle || ''):(task.title || '')}
                onCancel={() => setDialog(null)}
                onConfirm={onConfirm}/>}
        </span>
    )
}

/**
 * "A timer is running on this one."
 *
 * That is all a board row says now. It is a sign, not a control: a table of
 * forty rows with a play button in each invites a mis-click on the wrong line,
 * and the row is where you look for *what* is happening, not where you change
 * it. Operating the timer happens in the task, where its name is on screen.
 *
 * Renders nothing when nothing is running here, so the column stays quiet.
 */
export function TaskRunningDot({board, task}){
    const running = useRunningTimer()
    const isHere = runsHere(running, board?._id, task?.id)
    const elapsed = useRunningSpan(isHere?running:null)

    if(!isHere) return null

    return (
        <span className="task-running-dot" title={t('time.runningOnTask', {time: formatClock(elapsed)})}>
            <Icon name="stopwatch" className="icon"/>
        </span>
    )
}

function runsHere(running, boardId, taskId){
    return Boolean(running)
        && String(running.taskId) === String(taskId)
        && String(running.boardId) === String(boardId)
}

/** The row behind this opens the task; the timer must not. */
function stop(ev){
    ev.stopPropagation()
    ev.preventDefault()
}
