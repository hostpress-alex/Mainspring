import {useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {Icon} from '../icon'
import {t} from '../../i18n'
import {formatClock} from '../../services/time.service'
import {freezeClock, releaseClock} from './use-running-timer'

/**
 * The question asked when a timer stops.
 *
 * Three occasions, one dialog, because they ask the same thing in different
 * words:
 *
 *   pause   "I'll come back to this"      — note optional
 *   stop    "I'm done here for now"       — note optional
 *   switch  "you are still on X"          — and the answer decides which of
 *                                           the two the old timer gets
 *
 * The note is optional everywhere and always. A tracker that demands a
 * sentence before it lets you stop is a tracker people stop starting.
 *
 * Rendered through a portal, and that is not tidiness. The button that opens
 * this sits inside a task row, and the rows are dragged by @hello-pangea/dnd,
 * which puts a `transform` on their container. A `position: fixed` element
 * inside a transformed ancestor is positioned against THAT ancestor instead of
 * the viewport — so the first version came out clipped by the row, with the
 * checkbox cut off below the visible edge. It looked like a styling slip and
 * was a stacking-context one.
 */
export function TimeNoteDialog({mode, entry, taskTitle = '', onCancel, onConfirm}){
    /**
     * The clock stops here, not when this is submitted.
     *
     * Writing two sentences about what you did is not work on the task. The
     * moment is taken once, when the dialog opens, and it is both what the
     * dialog shows and what is sent as the end of the interval — so the number
     * on screen is the number that gets recorded, which is the least
     * surprising thing it could be.
     */
    const [pressedAt] = useState(() => Date.now())
    const [note, setNote] = useState('')
    const [postUpdate, setPostUpdate] = useState(false)
    const [busy, setBusy] = useState(false)
    const elNote = useRef()

    useEffect(() => { elNote.current?.focus() }, [])

    // Every clock in the app stops at this moment, not only the one here.
    useEffect(() => {
        freezeClock(pressedAt)
        return () => releaseClock()
    }, [pressedAt])

    useEffect(() => {
        function onKey(ev){
            if(ev.key === 'Escape'){ ev.preventDefault(); onCancel() }
        }
        document.addEventListener('keydown', onKey, true)
        return () => document.removeEventListener('keydown', onKey, true)
    }, [onCancel])

    const text = note.trim()

    async function confirm(chosen){
        if(busy) return
        setBusy(true)
        try {
            await onConfirm({
                mode: chosen, note: text,
                postUpdate: postUpdate && Boolean(text),
                endedAt: pressedAt
            })
        } finally {
            setBusy(false)
        }
    }

    const title = mode === 'switch'
        ?t('time.switchTitle', {task: taskTitle})
        :(mode === 'pause'?t('time.pauseTitle'):t('time.stopTitle'))

    return createPortal(
        <div className="time-dialog-overlay" onMouseDown={ev => {
            if(ev.target === ev.currentTarget) onCancel()
        }}>
            <div className="time-dialog" role="dialog" aria-modal="true" aria-label={title}>
                <h3 className="time-dialog-title">{title}</h3>

                {entry && <p className="time-dialog-elapsed">
                    <Icon name="stopwatch" className="icon"/>
                    {formatClock(pressedAt - entry.startedAt)}
                    {taskTitle && mode !== 'switch' && <span className="time-dialog-task">{taskTitle}</span>}
                </p>}

                <label className="time-dialog-label" htmlFor="time-note">{t('time.noteLabel')}</label>
                <textarea id="time-note" ref={elNote} className="time-dialog-note" rows={3}
                    placeholder={t('time.notePlaceholder')}
                    value={note} onChange={ev => setNote(ev.target.value)}/>

                {/* Only offered once there is something to post. A checkbox that
                    would publish an empty update is a trap, not a choice. */}
                <label className={`time-dialog-check${text?'':' is-off'}`}>
                    <input type="checkbox" checked={postUpdate && Boolean(text)} disabled={!text}
                        onChange={ev => setPostUpdate(ev.target.checked)}/>
                    <span>{t('time.alsoPost')}</span>
                </label>

                <div className="time-dialog-actions">
                    <button type="button" className="time-dialog-cancel" onClick={onCancel} disabled={busy}>
                        {t('common.cancel')}
                    </button>
                    {mode === 'switch'
                        ?<>
                            <button type="button" className="time-dialog-ok is-ghost" onClick={() => confirm('pause')} disabled={busy}>
                                <Icon name="pause" className="icon"/>{t('time.pauseOther')}
                            </button>
                            <button type="button" className="time-dialog-ok" onClick={() => confirm('stop')} disabled={busy}>
                                <Icon name="stop" className="icon"/>{t('time.stopOther')}
                            </button>
                        </>
                        :<button type="button" className="time-dialog-ok" onClick={() => confirm(mode)} disabled={busy}>
                            {mode === 'pause'?t('time.pause'):t('time.stop')}
                        </button>}
                </div>
            </div>
        </div>,
        document.body
    )
}
