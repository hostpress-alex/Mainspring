import {useCallback, useEffect, useState} from 'react'
import {useSelector} from 'react-redux'
import {Icon} from '../icon'
import {Avatar} from '../avatar'
import {t} from '../../i18n'
import * as boardRoles from '../../services/board-roles'
import {confirmDelete} from '../confirm-dialog'
import {
    timeService, formatDuration, formatClock, spanOf, toInputValue, fromInputValue
} from '../../services/time.service'
import {useRunningTimer, useRunningSpan, useTimesChanged, notifyTimesChanged} from './use-running-timer'
import {localErrorText} from '../../services/error-text'

/**
 * Every interval recorded on one task.
 *
 * The list is the point of the feature, not a report about it: this is where a
 * wrong entry gets fixed and a forgotten one gets typed in. Without that the
 * totals are only ever as good as everybody's memory of pressing a button, and
 * a total nobody believes is a total nobody looks at.
 *
 * Own entries are always editable. Somebody else's only for an owner of the
 * board — otherwise every correction waits for a person who is on holiday.
 */
export function TimePanel({board, task}){
    const user = useSelector(storeState => storeState.userModule.user)
    const running = useRunningTimer()
    const changed = useTimesChanged()

    const [data, setData] = useState({entries: [], total: 0, byUser: {}})
    const [isLoading, setIsLoading] = useState(true)
    const [editing, setEditing] = useState(null)
    const [isAdding, setIsAdding] = useState(false)

    const boardId = board?._id
    const taskId = task?.id
    const isOwner = boardRoles.isOwner(board, user)
    const canWork = boardRoles.canEdit(board, user)

    const runsHere = Boolean(running) && String(running.taskId) === String(taskId)
    // Shared with the header and the sidebar, so all three stop together while
    // a note is being written.
    const elapsed = useRunningSpan(runsHere?running:null)

    const load = useCallback(async () => {
        if(!boardId || !taskId) return
        try {
            setData(await timeService.forTask(boardId, taskId))
        } catch(err){
            console.error('could not read the time entries', err)
        } finally {
            setIsLoading(false)
        }
    }, [boardId, taskId])

    useEffect(() => { load() }, [load, changed])

    function mayTouch(entry){
        if(!canWork) return false
        return isOwner || String(entry.userId) === String(user?._id)
    }

    function nameOf(userId){
        const member = (board.members || []).find(m => String(m._id) === String(userId))
        return member?.fullname || t('time.someone')
    }

    function imgOf(userId){
        const member = (board.members || []).find(m => String(m._id) === String(userId))
        return member?.imgUrl || ''
    }

    async function onDelete(entry){
        if(!await confirmDelete({what: t('time.thisEntry')})) return
        await timeService.remove(entry.id)
        notifyTimesChanged()
    }

    async function onSaveEdit(values){
        await timeService.edit(editing.id, values)
        setEditing(null)
        notifyTimesChanged()
    }

    async function onAdd(values){
        await timeService.addManual({boardId, taskId, ...values})
        setIsAdding(false)
        notifyTimesChanged()
    }

    const people = Object.entries(data.byUser).sort((a, b) => b[1] - a[1])

    return (
        <section className="time-panel">
            <header className="time-panel-head">
                <div className="time-panel-total">
                    <span className="time-panel-total-value">{formatDuration(data.total)}</span>
                    <span className="time-panel-total-label">{t('time.totalOnTask')}</span>
                </div>
                {canWork && <button type="button" className="time-panel-add" onClick={() => setIsAdding(true)}>
                    <Icon name="plus" className="icon"/>{t('time.addManual')}
                </button>}
            </header>

            {people.length > 1 && <ul className="time-panel-people">
                {people.map(([userId, ms]) => (
                    <li key={userId}>
                        <Avatar src={imgOf(userId)} className="time-panel-avatar" title={nameOf(userId)}/>
                        <span className="time-panel-person">{nameOf(userId)}</span>
                        <span className="time-panel-person-total">{formatDuration(ms)}</span>
                    </li>
                ))}
            </ul>}

            {isAdding && <TimeEntryForm
                onCancel={() => setIsAdding(false)}
                onSave={onAdd}
                submitLabel={t('common.save')}/>}

            {isLoading && <p className="time-panel-empty">{t('common.loading')}</p>}
            {!isLoading && !data.entries.length && !isAdding &&
                <p className="time-panel-empty">{t('time.none')}</p>}

            <ul className="time-panel-list">
                {[...data.entries].reverse().map(entry => (
                    <li key={entry.id} className={`time-entry${entry.endedAt?'':' is-running'}${entry.endedBy === 'auto'?' is-auto':''}`}>
                        {editing?.id === entry.id
                            ?<TimeEntryForm
                                entry={entry}
                                onCancel={() => setEditing(null)}
                                onSave={onSaveEdit}
                                submitLabel={t('common.save')}/>
                            :<>
                                <Avatar src={imgOf(entry.userId)} className="time-entry-avatar" title={nameOf(entry.userId)}/>
                                <div className="time-entry-body">
                                    <div className="time-entry-line">
                                        <span className="time-entry-span">{whenOf(entry)}</span>
                                        <span className="time-entry-duration">
                                            {entry.endedAt
                                                ?formatDuration(spanOf(entry))
                                                :formatClock(elapsed)}
                                        </span>
                                        {entry.source === 'manual' &&
                                            <span className="time-entry-tag" title={t('time.manualHint')}>{t('time.manual')}</span>}
                                        {entry.endedBy === 'auto' &&
                                            <span className="time-entry-tag is-warn" title={t('time.autoHint')}>{t('time.auto')}</span>}
                                    </div>
                                    {entry.note && <p className="time-entry-note">{entry.note}</p>}
                                </div>
                                {mayTouch(entry) && entry.endedAt && <div className="time-entry-actions">
                                    <button type="button" title={t('common.edit')} onClick={() => setEditing(entry)}>
                                        <Icon name="pen" className="icon"/>
                                    </button>
                                    <button type="button" title={t('common.delete')} onClick={() => onDelete(entry)}>
                                        <Icon name="trash-can" variant="fa-regular" className="icon"/>
                                    </button>
                                </div>}
                            </>}
                    </li>
                ))}
            </ul>
        </section>
    )
}

/** "18.08., 14:30 – 15:45" — the day only where it helps. */
function whenOf(entry){
    const from = new Date(entry.startedAt)
    const to = entry.endedAt?new Date(entry.endedAt):null
    const day = from.toLocaleDateString(undefined, {day: '2-digit', month: '2-digit'})
    const clock = d => d.toLocaleTimeString(undefined, {hour: '2-digit', minute: '2-digit'})
    if(!to) return `${day}, ${t('time.since')} ${clock(from)}`
    const sameDay = from.toDateString() === to.toDateString()
    return sameDay
        ?`${day}, ${clock(from)} – ${clock(to)}`
        :`${day}, ${clock(from)} – ${to.toLocaleDateString(undefined, {day: '2-digit', month: '2-digit'})}, ${clock(to)}`
}

/**
 * One row of inputs, for both jobs.
 *
 * Correcting an entry and typing one in from scratch ask for exactly the same
 * three things, so they are the same form. The only difference is what it
 * starts out holding.
 */
function TimeEntryForm({entry = null, onCancel, onSave, submitLabel}){
    const now = Date.now()
    const [from, setFrom] = useState(toInputValue(entry?.startedAt ?? now - 30 * 60 * 1000))
    const [to, setTo] = useState(toInputValue(entry?.endedAt ?? now))
    const [note, setNote] = useState(entry?.note || '')
    const [postUpdate, setPostUpdate] = useState(false)
    const [err, setErr] = useState(null)
    const [busy, setBusy] = useState(false)

    async function submit(ev){
        ev.preventDefault()
        const startedAt = fromInputValue(from)
        const endedAt = fromInputValue(to)
        if(!startedAt || !endedAt) return setErr(t('time.errorTimes'))
        if(endedAt <= startedAt) return setErr(t('time.errorOrder'))
        setErr(null)
        setBusy(true)
        try {
            await onSave({startedAt, endedAt, note: note.trim(), postUpdate: postUpdate && Boolean(note.trim())})
        } catch(error){
            setErr(localErrorText(error))
        } finally {
            setBusy(false)
        }
    }

    return (
        <form className="time-entry-form" onSubmit={submit}>
            <div className="time-entry-form-row">
                <label>
                    <span>{t('time.from')}</span>
                    <input type="datetime-local" value={from} onChange={ev => setFrom(ev.target.value)}/>
                </label>
                <label>
                    <span>{t('time.to')}</span>
                    <input type="datetime-local" value={to} onChange={ev => setTo(ev.target.value)}/>
                </label>
            </div>
            <input type="text" className="time-entry-form-note" placeholder={t('time.notePlaceholder')}
                value={note} onChange={ev => setNote(ev.target.value)}/>
            {!entry && <label className={`time-entry-form-check${note.trim()?'':' is-off'}`}>
                <input type="checkbox" checked={postUpdate && Boolean(note.trim())} disabled={!note.trim()}
                    onChange={ev => setPostUpdate(ev.target.checked)}/>
                <span>{t('time.alsoPost')}</span>
            </label>}
            {err && <p className="time-entry-form-error" role="alert">{err}</p>}
            <div className="time-entry-form-actions">
                <button type="button" onClick={onCancel} disabled={busy}>{t('common.cancel')}</button>
                <button type="submit" className="is-primary" disabled={busy}>{submitLabel}</button>
            </div>
        </form>
    )
}
