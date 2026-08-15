import { useEffect, useMemo, useRef, useState } from 'react'
import { toLocalInput, fromLocalInput, fmtDuration, MS_MIN } from '../../services/date.util'

const PRESETS = [30, 60, 90, 120, 240, 480]

/**
 * Anlegen und Bearbeiten eines Kalendereintrags.
 * `draft` enthaelt start/end (Date) und optional _id sowie die Task-Bezuege.
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

    /** Boards in der Reihenfolge, in der sie geladen wurden — ohne Duplikate. */
    const boards = useMemo(() => {
        const seen = new Map()
        for (const t of tasks) if (!seen.has(t.boardId)) seen.set(t.boardId, t.boardTitle)
        return [...seen].map(([_id, title]) => ({ _id, title }))
    }, [tasks])

    // Ist nur ein Board vorhanden, direkt vorauswaehlen — spart einen Klick.
    useEffect(() => {
        if (!boardId && boards.length === 1) setBoardId(boards[0]._id)
    }, [boards, boardId])

    /** Nur Tasks des gewaehlten Boards, zusaetzlich per Suchtext gefiltert. */
    const visibleTasks = useMemo(() => {
        if (!boardId) return []
        const q = filter.trim().toLowerCase()
        const list = tasks.filter(t => t.boardId === boardId && (!q || t.search.includes(q)))
        return list.slice(0, 300)
    }, [tasks, boardId, filter])

    // Board gewechselt: eine Task-Auswahl aus dem alten Board waere ungueltig.
    function onChangeBoard (nextBoardId) {
        setBoardId(nextBoardId)
        setFilter('')
        setTaskKey(prev => prev.startsWith(`${nextBoardId}|`) ? prev : '')
    }

    const selected = useMemo(
        () => tasks.find(t => `${t.boardId}|${t.taskId}` === taskKey) || null,
        [tasks, taskKey]
    )

    const startDate = fromLocalInput(start)
    const endDate = fromLocalInput(end)
    const durationMs = endDate - startDate

    function applyPreset (minutes) {
        setEnd(toLocalInput(new Date(startDate.getTime() + minutes * MS_MIN)))
    }

    /** Beim Verschieben des Beginns die Dauer beibehalten. */
    function onChangeStart (value) {
        const next = fromLocalInput(value)
        const keep = durationMs > 0 ? durationMs : 60 * MS_MIN
        setStart(value)
        setEnd(toLocalInput(new Date(next.getTime() + keep)))
    }

    function submit (ev) {
        ev.preventDefault()
        setErr(null)
        if (!selected) return setErr('Bitte einen Task auswaehlen.')
        if (!(durationMs > 0)) return setErr('Das Ende muss nach dem Beginn liegen.')
        if (durationMs < 5 * MS_MIN) return setErr('Der Eintrag muss mindestens 5 Minuten lang sein.')
        if (durationMs > 24 * 60 * MS_MIN) return setErr('Der Eintrag darf hoechstens 24 Stunden dauern.')

        onSave({
            _id: draft._id,
            boardId: selected.boardId,
            taskId: selected.taskId,
            start: startDate,
            end: endDate,
            note,
        }).catch(e => setErr(e?.response?.data?.err || e.message || 'Speichern fehlgeschlagen'))
    }

    return (
        <div className='cal-backdrop' onMouseDown={ev => { if (ev.target === ev.currentTarget) onClose() }}>
            <form className='cal-dialog' onSubmit={submit}>
                <div className='cal-dialog-head'>
                    <h2>{isEdit ? 'Eintrag bearbeiten' : 'Zeit einplanen'}</h2>
                </div>

                <div className='cal-dialog-body'>
                    {err && <div className='cal-error'>{err}</div>}

                    <div className='cal-field'>
                        <label htmlFor='cal-board'>Board</label>
                        <select id='cal-board' ref={elFirst} value={boardId}
                            onChange={e => onChangeBoard(e.target.value)}>
                            <option value=''>Board waehlen…</option>
                            {boards.map(b => <option key={b._id} value={b._id}>{b.title}</option>)}
                        </select>
                    </div>

                    <div className='cal-field'>
                        <label htmlFor='cal-filter'>Task suchen</label>
                        <input id='cal-filter' value={filter} placeholder='Titel oder Gruppe…'
                            disabled={!boardId} onChange={e => setFilter(e.target.value)} />
                    </div>

                    <div className='cal-field'>
                        <label htmlFor='cal-task'>Task{boardId ? ` (${visibleTasks.length})` : ''}</label>
                        <select id='cal-task' size={Math.min(Math.max(visibleTasks.length, 2), 7)}
                            disabled={!boardId}
                            value={taskKey} onChange={e => setTaskKey(e.target.value)}>
                            {!boardId && <option value='' disabled>Erst ein Board waehlen</option>}
                            {boardId && !visibleTasks.length && <option value='' disabled>Kein Task gefunden</option>}
                            {visibleTasks.map(t => (
                                <option key={`${t.boardId}|${t.taskId}`} value={`${t.boardId}|${t.taskId}`}>
                                    {t.taskTitle} — {t.groupTitle}
                                </option>
                            ))}
                        </select>
                        {selected && (
                            <span className='cal-hint'>
                                <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2,
                                    background: selected.color, marginRight: 6 }} />
                                {selected.boardTitle} · {selected.groupTitle}
                            </span>
                        )}
                    </div>

                    <div className='cal-row2'>
                        <div className='cal-field'>
                            <label htmlFor='cal-start'>Beginn</label>
                            <input id='cal-start' type='datetime-local' value={start}
                                onChange={e => onChangeStart(e.target.value)} />
                        </div>
                        <div className='cal-field'>
                            <label htmlFor='cal-end'>Ende</label>
                            <input id='cal-end' type='datetime-local' value={end}
                                onChange={e => setEnd(e.target.value)} />
                        </div>
                    </div>

                    <div className='cal-field'>
                        <label>Dauer</label>
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
                            {durationMs > 0 ? `Geplant: ${fmtDuration(durationMs)}` : 'Ende liegt vor dem Beginn'}
                        </span>
                    </div>

                    <div className='cal-field'>
                        <label htmlFor='cal-note'>Notiz (optional)</label>
                        <textarea id='cal-note' rows={2} maxLength={500} value={note}
                            onChange={e => setNote(e.target.value)} />
                    </div>
                </div>

                <div className='cal-dialog-foot'>
                    <div>
                        {isEdit && (
                            <button type='button' className='cal-btn cal-btn-danger' disabled={busy}
                                onClick={() => onDelete(draft._id)}>Loeschen</button>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button type='button' className='cal-btn' onClick={onClose} disabled={busy}>Abbrechen</button>
                        <button type='submit' className='cal-btn cal-btn-primary' disabled={busy}>
                            {busy ? 'Speichert…' : 'Speichern'}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    )
}
