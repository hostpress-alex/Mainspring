import {useCallback, useEffect, useMemo, useState} from 'react'
import {useSelector} from 'react-redux'
import {Link, useNavigate, useLocation, useSearchParams} from 'react-router-dom'

import {scheduleService} from '../services/schedule.service'
import {withTaskParams} from '../services/task-link'
import {estimatesFromBoards, progressOf, taskKey} from '../services/task-progress'
import {useTotalsForBoards} from '../cmps/time/use-board-totals'
import {useRunningTimer} from '../cmps/time/use-running-timer'
import {externalEvents} from '../services/calendar-sync.service'
import {myWorkHours, weekSummary} from '../services/workhours.service'
import {WeekBar} from '../cmps/calendar/week-bar'
import {PlanReport} from '../cmps/calendar/plan-report'
import {runPlan} from '../services/planner.service'
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
    const navigate = useNavigate()
    const location = useLocation()
    const [searchParams] = useSearchParams()
    const [view, setView] = useState(() => localStorage.getItem('calView') || 'week')
    const [anchor, setAnchor] = useState(() => startOfDay(new Date()))
    const [entries, setEntries] = useState([])
    // Everything that comes from outside: read-only, and kept apart from the
    // entries so that nothing can accidentally save one of them.
    const [external, setExternal] = useState([])
    const [workHours, setWorkHours] = useState([])
    const [summary, setSummary] = useState(null)
    const [tasks, setTasks] = useState([])
    const [estimates, setEstimates] = useState({})
    const [draft, setDraft] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [report, setReport] = useState(null)
    const [isPlanning, setIsPlanning] = useState(false)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState(null)

    /**
     * Plan this week.
     *
     * The plan is written and then the window is loaded again rather than
     * being patched in from the answer: the planner touches entries outside
     * the visible range as well, and a calendar that shows a mixture of what
     * it was told and what is stored is the bug that took the board weeks to
     * get rid of.
     */
    async function onPlanWeek(){
        if(isPlanning) return
        setIsPlanning(true)
        setErr(null)
        try {
            setReport(await runPlan())
            await load()
        } catch(e) {
            setErr(readErr(e))
        } finally {
            setIsPlanning(false)
        }
    }

    /** Visible time range — decides what gets loaded. */
    const range = useMemo(() => {
        if(view === 'day') return {from: startOfDay(anchor), to: addDays(startOfDay(anchor), 1)}
        if(view === 'week') return {from: startOfWeek(anchor), to: addDays(startOfWeek(anchor), 7)}
        // Month: the grid shows clipped neighbouring weeks with
        return {from: startOfWeek(startOfMonth(anchor)), to: addDays(startOfWeek(startOfMonth(anchor)), 42)}
    }, [view, anchor])

    /**
     * What is on each block besides its title: the timer, and how much has
     * been recorded against the task.
     *
     * The totals endpoint answers per board, and one week can hold blocks from
     * three of them — so this is one request per board in view, not one per
     * block. They share the cache with the board rows, so a board that is
     * already open costs nothing here.
     */
    const running = useRunningTimer()
    const boardIds = useMemo(
        () => [...new Set([...entries].map(e => e.boardId).filter(Boolean))],
        [entries])
    const totals = useTotalsForBoards(boardIds)

    const taskInfo = useMemo(() => {
        const out = {}
        for(const entry of entries){
            if(!entry.boardId || !entry.taskId) continue
            const key = taskKey(entry.boardId, entry.taskId)
            if(out[key]) continue
            out[key] = {
                progress: progressOf({spentMs: totals[key], estimateMinutes: estimates[key]}),
                isRunning: Boolean(running)
                    && String(running.boardId) === String(entry.boardId)
                    && String(running.taskId) === String(entry.taskId)
            }
        }
        return out
    }, [entries, totals, estimates, running])

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
        boardService.query().then(boards => {
            setTasks(scheduleService.tasksFromBoards(boards))
            // The same answer, read a second way. The picker wants a flat list
            // of tasks; the blocks want the estimate behind each of them, and
            // asking the server twice for one payload would be silly.
            setEstimates(estimatesFromBoards(boards))
        }).catch(e => setErr(readErr(e)))
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

    /**
     * Where a click on an entry goes: to the task — without leaving the week.
     *
     * The task is hung off the current address as three parameters and
     * `task-panel-host` opens the panel over the calendar. The first version
     * navigated to the board instead, which answered the question and took the
     * week you were reading away in exchange.
     *
     * An entry that names no task opens its own dialog. The server refuses to
     * store one of those, so this should never happen — but a click that
     * quietly does nothing is the thing this whole change is against.
     */
    function onOpenTask(entry){
        if(!entry || !entry.boardId || !entry.taskId){
            setDraft(entry)
            return
        }
        navigate({
            pathname: location.pathname,
            search: `?${withTaskParams(searchParams, entry).toString()}`
        })
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
                    {/* Plans this week and no further — see the planner. The
                        report below says what did not fit; the calendar behind
                        it already shows what did. */}
                    <button className="cal-plan-btn" disabled={isPlanning} onClick={onPlanWeek}>
                        {isPlanning?t('planner.running'):t('planner.planWeek')}
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

            <PlanReport report={report} onClose={() => setReport(null)}/>
            {isLoading && <div className="cal-loading">{t('common.loading')}</div>}

            {view === 'month'?(
                <MonthGrid date={anchor} entries={entries} external={external} workHours={workHours} taskInfo={taskInfo} onCreate={setDraft} onOpen={setDraft} onOpenTask={onOpenTask} onPickDay={day => {
                    setAnchor(startOfDay(day));
                    setView('day')
                }}/>
            ):(
                <TimeGrid days={view === 'day'?[startOfDay(anchor)]:weekDays(anchor)} entries={entries}
                    external={external} workHours={workHours} taskInfo={taskInfo}
                    onCreate={setDraft} onMove={onMove} onOpen={setDraft} onOpenTask={onOpenTask}/>
            )}

            {draft && (
                <EntryDialog draft={draft} tasks={tasks} busy={busy} onSave={onSave} onDelete={onDelete} onClose={() => setDraft(null)}/>
            )}
        </div>
    )
}
