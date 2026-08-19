import {useCallback, useEffect, useMemo, useState} from 'react'
import {useSelector} from 'react-redux'
import {Link} from 'react-router-dom'

import {scheduleService} from '../services/schedule.service'
import {externalEvents} from '../services/calendar-sync.service'
import {myWorkHours, weekSummary} from '../services/workhours.service'
import {WeekBar} from '../cmps/calendar/week-bar'
import {boardService} from '../services/board.service'
import { Avatar } from '../cmps/avatar'
import {TimeGrid} from '../cmps/calendar/time-grid'
import {MonthGrid} from '../cmps/calendar/month-grid'
import {EntryDialog} from '../cmps/calendar/entry-dialog'
import {
    addDays, addMonths, startOfDay, startOfWeek, startOfMonth, endOfMonth,
    weekDays, fmtDate, fmtMonthYear, fmtWeekdayLong, isoWeek, MS_MIN
} from '../services/date.util'
import {t} from '../i18n'

const VIEWS = [
    {key: 'day', label: 'Tag'},
    {key: 'week', label: 'Woche'},
    {key: 'month', label: 'Monat'}
]

const readErr = e => e?.response?.data?.err || e?.message || t('common.unknownError')

export function CalendarPage(){
    const user = useSelector(storeState => storeState.userModule.user)
    const [view, setView] = useState(() => localStorage.getItem('calView') || 'week')
    const [anchor, setAnchor] = useState(() => startOfDay(new Date()))
    const [entries, setEntries] = useState([])
    // Everything that comes from outside: read-only, and kept apart from the
    // entries so that nothing can accidentally save one of them.
    const [external, setExternal] = useState([])
    const [workHours, setWorkHours] = useState([])
    const [summary, setSummary] = useState(null)
    const [tasks, setTasks] = useState([])
    const [draft, setDraft] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState(null)

    /** Visible time range — decides what gets loaded. */
    const range = useMemo(() => {
        if(view === 'day') return {from: startOfDay(anchor), to: addDays(startOfDay(anchor), 1)}
        if(view === 'week') return {from: startOfWeek(anchor), to: addDays(startOfWeek(anchor), 7)}
        // Month: the grid shows clipped neighbouring weeks with
        return {from: startOfWeek(startOfMonth(anchor)), to: addDays(startOfWeek(startOfMonth(anchor)), 42)}
    }, [view, anchor])

    const load = useCallback(async() => {
        setErr(null)
        try {
            // Own entries first and alone in the error path: a calendar
            // without the Google mirror is still a calendar, but one without
            // its own entries is broken and has to say so.
            const list = await scheduleService.query(range.from, range.to)
            setEntries(list)
        } catch(e) {
            setErr(readErr(e))
        } finally {
            setIsLoading(false)
        }

        // The three below are additions to the picture. A server that has
        // never seen a Google key answers them with nothing, and the page
        // looks exactly as it did before this feature existed.
        externalEvents(range.from, range.to)
            .then(res => setExternal(res.events || []))
            .catch(() => setExternal([]))
        weekSummary(range.from, range.to)
            .then(setSummary)
            .catch(() => setSummary(null))
    }, [range.from.getTime(), range.to.getTime()])

    // Working hours change about twice a year, so they are not part of the
    // window load.
    useEffect(() => {
        myWorkHours().then(res => setWorkHours(res.days || [])).catch(() => setWorkHours([]))
    }, [])

    useEffect(() => {
        setIsLoading(true);
        load()
    }, [load])

    useEffect(() => {
        boardService.query().then(boards => setTasks(scheduleService.tasksFromBoards(boards))).catch(e => setErr(readErr(e)))
    }, [])

    useEffect(() => {
        localStorage.setItem('calView', view)
    }, [view])

    function step(dir){
        if(view === 'day') return setAnchor(a => addDays(a, dir))
        if(view === 'week') return setAnchor(a => addDays(a, dir * 7))
        setAnchor(a => addMonths(a, dir))
    }

    async function onSave(entry){
        setBusy(true)
        try {
            await scheduleService.save(entry)
            setDraft(null)
            await load()
        } finally {
            setBusy(false)
        }
    }

    async function onDelete(id){
        setBusy(true)
        try {
            await scheduleService.remove(id)
            setDraft(null)
            await load()
        } catch(e) {
            setErr(readErr(e))
        } finally {
            setBusy(false)
        }
    }

    /** Moving and resizing save straight away, without a dialog. */
    async function onMove(entry, {start, end}){
        const prev = entries
        setEntries(list => list.map(e => e._id === entry._id?{...e, start, end}:e))
        try {
            await scheduleService.save({...entry, start, end})
            await load()
        } catch(e) {
            setEntries(prev)               // Rollback, so the display does not lie
            setErr(readErr(e))
        }
    }

    const title = view === 'day'
        ?`${fmtWeekdayLong(anchor)}, ${fmtDate(anchor)}`
        :view === 'week'
            ?`${fmtDate(startOfWeek(anchor))} – ${fmtDate(addDays(startOfWeek(anchor), 6))}`
            :fmtMonthYear(anchor)

    return (
        <div className="cal">
            <div className="cal-topbar">
                <div className="cal-topbar-left">
                    <button className="cal-btn" onClick={() => setAnchor(startOfDay(new Date()))}>{t('calendar.today')}</button>
                    <div className="cal-nav">
                        <button onClick={() => step(-1)} title={t('common.back')} aria-label={t('common.back')}>‹</button>
                        <button onClick={() => step(1)} title={t('common.forward')} aria-label={t('common.forward')}>›</button>
                    </div>
                    <h1 className="cal-title">{title}</h1>
                    {view !== 'month' && <span className="cal-kw">KW {isoWeek(anchor)}</span>}
                </div>

                <div className="cal-topbar-right">
                    <button className="cal-btn cal-btn-primary" onClick={() => {
                        const start = new Date(startOfDay(anchor).getTime() + 9 * 60 * MS_MIN)
                        setDraft({start, end: new Date(start.getTime() + 60 * MS_MIN)})
                    }}>+ Zeit einplanen
                    </button>
                    <div className="cal-switch">
                        {VIEWS.map(v => (
                            <button key={v.key} className={view === v.key?'is-active':''} onClick={() => setView(v.key)}>{v.label}</button>
                        ))}
                    </div>
                    <Link to="/profile" title={t('nav.profile')}>
                        <Avatar src={user?.imgUrl} className="cal-avatar"/>
                    </Link>
                </div>
            </div>

            {err && <div className="cal-error">{err}</div>}

            <WeekBar summary={summary} view={view}/>
            {isLoading && <div className="cal-loading">{t('common.loading')}</div>}

            {view === 'month'?(
                <MonthGrid date={anchor} entries={entries} external={external} workHours={workHours} onCreate={setDraft} onOpen={setDraft} onPickDay={day => {
                    setAnchor(startOfDay(day));
                    setView('day')
                }}/>
            ):(
                <TimeGrid days={view === 'day'?[startOfDay(anchor)]:weekDays(anchor)} entries={entries}
                    external={external} workHours={workHours}
                    onCreate={setDraft} onMove={onMove} onOpen={setDraft}/>
            )}

            {draft && (
                <EntryDialog draft={draft} tasks={tasks} busy={busy} onSave={onSave} onDelete={onDelete} onClose={() => setDraft(null)}/>
            )}
        </div>
    )
}
