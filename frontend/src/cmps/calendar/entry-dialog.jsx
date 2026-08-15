import { useEffect, useMemo, useRef, useState } from 'react'
import { toLocalInput, fromLocalInput, fmtDuration, MS_MIN } from '../../services/date.util'
import { confirmDelete } from '../confirm-dialog'
import { t } from '../../i18n'

const PRESETS = [30, 60, 90, 120, 240, 480]

/**
 * Creating and editing a calendar entry.
 * `draft` holds start/end (Date) and optionally _id as well as the task refs.
 */
export function EntryDialog ({ draft, tasks, onSave, onDelete, onClose, busy }) {
    const isEdit = Boolean(draft?._id)
    const [boardId, setBoardId] = useState(draft?.boardId || '')
    const [taskKey, setTaskKey] = useState(draft?.taskId ? `${draft.boardId}|${draft.taskId}` : '')
    const [filter, setFilter] = useState('')
    const [start, setStart] = useState(toLocalInput(new Date(draft.start)))
    const [end, setEnd] = useState(toLocalInput(new Date(draft.end)))
    const [note, setNote] = useState(draft?.note || '')
    const [err, setErr] = useState(null)
    const elFirst = useRef()

    useEffect(() => {
        elFirst.current?.focus()
        const onKey = ev => { if (ev.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    /** Boards in the order they were loaded — without duplicates. */
    const boards = useMemo(() => {
        const seen = new Map()
        for (const task of tasks) if (!seen.has(task.boardId)) seen.set(task.boardId, task.boardTitle)
        return [...seen].map(([_id, title]) => ({ _id, title }))
    }, [tasks])

    // If there is only one board, preselect it — saves a click.
    useEffect(() => {
        if (!boardId && boards.length === 1) setBoardId(boards[0]._id)
    }, [boards, boardId])

    /** Only tasks of the chosen board, filtered by the search text on top. */
    const visibleTasks = useMemo(() => {
        if (!boardId) return []
        const q = filter.trim().toLowerCase()
        const list = tasks.filter(task => task.boardId === boardId && (!q || task.search.includes(q)))
        return list.slice(0, 300)
    }, [tasks, boardId, filter])

    // Board changed: a task picked from the old board would be invalid.
    function onChangeBoard (nextBoardId) {
        setBoardId(nextBoardId)
        setFilter('')
        setTaskKey(prev => prev.startsWith(`${nextBoardId}|`) ? prev : '')
    }

    const selected = useMemo(
        () => tasks.find(task => `${task.boardId}|${task.taskId}` === taskKey) || null,
        [tasks, taskKey]
    )

    const startDate = fromLocalInput(start)
    const endDate = fromLocalInput(end)
    const durationMs = endDate - startDate

    function applyPreset (minutes) {
        setEnd(toLocalInput(new Date(startDate.getTime() + minutes * MS_MIN)))
    }

    /** Keep the duration when the start is moved. */
    function onChangeStart (value) {
        const next = fromLocalInput(value)
        const keep = durationMs > 0 ? durationMs : 60 * MS_MIN
        setStart(value)
        setEnd(toLocalInput(new Date(next.getTime() + keep)))
    }

    function submit (ev) {
        ev.preventDefault()
        setErr(null)
        if (!selected) return setErr(t('calendar.taskRequired'))
        if (!(durationMs > 0)) return setErr(t('calendar.endAfterStart'))
        if (durationMs < 5 * MS_MIN) return setErr(t('calendar.minDuration'))
        if (durationMs > 24 * 60 * MS_MIN) return setErr(t('calendar.maxDuration'))

        onSave({
            _id: draft._id,
            boardId: selected.boardId,
            taskId: selected.taskId,
            start: startDate,
            end: endDate,
            note,
        }).catch(e => setErr(e?.response?.data?.err || e.message || t('common.saveFailed')))
    }

    return (
        <div className='cal-backdrop' onMouseDown={ev => { if (ev.target === ev.currentTarget) onClose() }}>
            <form className='cal-dialog' onSubmit={submit}>
                <div className='cal-dialog-head'>
                    <h2>{isEdit ? t('calendar.edit') : t('calendar.new')}</h2>
                </div>

                <div className='cal-dialog-body'>
                    {err && <div className='cal-error'>{err}</div>}

                    <div className='cal-field'>
                        <label htmlFor='cal-board'>{t('board.board')}</label>
                        <select id='cal-board' ref={elFirst} value={boardId}
                            onChange={e => onChangeBoard(e.target.value)}>
                            <option value=''>{t('calendar.chooseBoard')}</option>
                            {boards.map(b => <option key={b._id} value={b._id}>{b.title}</option>)}
                        </select>
                    </div>

                    <div className='cal-field'>
                        <label htmlFor='cal-filter'>{t('calendar.searchTask')}</label>
                        <input id='cal-filter' value={filter} placeholder={t('calendar.filterPlaceholder')}
                            disabled={!boardId} onChange={e => setFilter(e.target.value)} />
                    </div>

                    <div className='cal-field'>
                        <label htmlFor='cal-task'>{t('task.task')}{boardId ? ` (${visibleTasks.length})` : ''}</label>
                        <select id='cal-task' size={Math.min(Math.max(visibleTasks.length, 2), 7)}
                            disabled={!boardId}
                            value={taskKey} onChange={e => setTaskKey(e.target.value)}>
                            {!boardId && <option value='' disabled>{t('calendar.chooseBoardFirst')}</option>}
                            {boardId && !visibleTasks.length && <option value='' disabled>{t('calendar.noTaskFound')}</option>}
                            {visibleTasks.map(task => (
                                <option key={`${task.boardId}|${task.taskId}`} value={`${task.boardId}|${task.taskId}`}>
                                    {task.taskTitle} — {task.groupTitle}
                                </option>
                            ))}
                        </select>
                        {selected && (
                            <span className='cal-hint'>
                                <span className='cal-hint-dot' style={{ '--entry-color': selected.color }} />
                                {selected.boardTitle} · {selected.groupTitle}
                            </span>
                        )}
                    </div>

                    <div className='cal-row2'>
                        <div className='cal-field'>
                            <label htmlFor='cal-start'>{t('calendar.start')}</label>
                            <input id='cal-start' type='datetime-local' value={start}
                                onChange={e => onChangeStart(e.target.value)} />
                        </div>
                        <div className='cal-field'>
                            <label htmlFor='cal-end'>{t('calendar.end')}</label>
                            <input id='cal-end' type='datetime-local' value={end}
                                onChange={e => setEnd(e.target.value)} />
                        </div>
                    </div>

                    <div className='cal-field'>
                        <label>{t('calendar.duration')}</label>
                        <div className='cal-presets'>
                            {PRESETS.map(m => (
                                <button type='button' key={m}
                                    className={`cal-preset${Math.round(durationMs / MS_MIN) === m ? ' is-active' : ''}`}
                                    onClick={() => applyPreset(m)}>
                                    {fmtDuration(m * MS_MIN)}
                                </button>
                            ))}
                        </div>
                        <span className='cal-hint'>
                            {durationMs > 0 ? t('calendar.planned', { duration: fmtDuration(durationMs) }) : t('calendar.endBeforeStart')}
                        </span>
                    </div>

                    <div className='cal-field'>
                        <label htmlFor='cal-note'>{t('calendar.note')}</label>
                        <textarea id='cal-note' rows={2} maxLength={500} value={note}
                            onChange={e => setNote(e.target.value)} />
                    </div>
                </div>

                <div className='cal-dialog-foot'>
                    <div>
                        {isEdit && (
                            <button type='button' className='cal-btn cal-btn-danger' disabled={busy}
                                onClick={async () => {
                                    if (await confirmDelete({ what: t('calendar.thisEntry') })) onDelete(draft._id)
                                }}>{t('common.delete')}</button>
                        )}
                    </div>
                    <div className='cal-dialog-actions'>
                        <button type='button' className='cal-btn' onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
                        <button type='submit' className='cal-btn cal-btn-primary' disabled={busy}>
                            {busy ? t('common.saving') : t('common.save')}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    )
}
