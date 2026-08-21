import {useEffect, useLayoutEffect, useRef, useState} from 'react'
import {
    addDays, isToday, isSameDay, layoutDay, minutesOfDay, snapMinutes,
    startOfDay, fmtTime, fmtDuration, pad, WEEKDAYS_SHORT, MS_MIN
} from '../../services/date.util'
import {t} from '../../i18n'
import {EntryMarks} from './entry-marks'
import {taskKey} from '../../services/task-progress'
import {Icon} from '../icon'

const SNAP = 15                 // minute grid for dragging and creating
const MIN_DRAG_MINUTES = 15     // below this it counts as a click, not as a drag
const DEFAULT_MINUTES = 60      // duration for a plain click into the grid
const GUTTER_PX = 58           // width of the hour rail, see calendar.css
/** A little sky above the first entry, so it does not sit on the top edge. */
const AIR_ABOVE_PX = 24

/**
 * Day and week view.
 *
 * Interaction:
 *  - dragging in the empty grid creates a new entry
 *  - clicking the empty grid creates an entry of DEFAULT_MINUTES
 *  - dragging an entry moves it (onto another day as well)
 *  - dragging the bottom edge changes the duration
 *  - clicking without moving opens the TASK
 *  - the pencil in the corner opens the entry itself
 *
 * The last two used to be one thing, and the wrong one won. An entry in this
 * calendar is a block of time reserved for a task, and what somebody wants
 * when they click it is almost always the task — what is it, what has been
 * said about it, is it done. Its start and end are already changed by dragging
 * the block, which is the whole reason the grid can be dragged; the dialog
 * behind them was the rarer of the two answers sitting in the commoner one's
 * place.
 */
/**
 * Entries that came from outside, in the shape the layout already
 * understands.
 *
 * They are given an `_id` with a prefix so that nothing can confuse one with
 * a schedule entry — the drag code keys on `_id`, and an external entry that
 * matched would become draggable, which is exactly what must not happen.
 */
function asEntries(external, noTitle){
    return (external || []).filter(e => !e.isAllDay).map(e => ({
        _id: 'ext:' + e.id,
        isExternal: true,
        source: e.source,
        taskTitle: e.title || noTitle,
        boardTitle: '',
        groupTitle: '',
        color: '#9699a6',
        start: new Date(e.start),
        end: new Date(e.end)
    }))
}

/** The shaded bands of a day: everything outside the working hours. */
function offHoursOf(workHours, day){
    const hours = (workHours || []).find(h => h.weekday === day.getDay())
    if(!hours) return [{topPct: 0, heightPct: 100}]
    const bands = []
    if(hours.startMin > 0) bands.push({topPct: 0, heightPct: (hours.startMin / 1440) * 100})
    if(hours.endMin < 1440) bands.push({topPct: (hours.endMin / 1440) * 100, heightPct: ((1440 - hours.endMin) / 1440) * 100})
    return bands
}

/**
 * Which part of the day is worth looking at.
 *
 * The grid is all 24 hours and it has to be — an entry at 04:30 is a real
 * entry and a calendar that cannot show it is broken. But a day whose content
 * sits between 09:00 and 18:00 used to open at midnight, so seeing anything
 * cost eight empty hours of scrolling. The old code scrolled to a fixed
 * `(7/24) * range * 1.15` — a guess with a fudge factor in it, wrong in both
 * directions: past an early entry, short of a late one.
 *
 * Read from what is actually on screen, in this order:
 *
 *   1. the entries in view, the ones from Google included. They take up the
 *      same room and are just as much a reason to be looking somewhere.
 *   2. failing that, the working hours of the days shown. An empty Tuesday
 *      should still open on Tuesday's working day rather than at midnight.
 *   3. failing that — nothing planned, no hours recorded — a plain office day.
 *
 * Minutes since midnight, both ends.
 */
const FALLBACK_FROM = 8 * 60
const FALLBACK_TO = 18 * 60

/** A Date, whatever it arrived as. Null when it is not a moment at all. */
function toDate(value){
    if(value === null || value === undefined || value === '') return null
    const date = (value instanceof Date)?value:new Date(value)
    return Number.isNaN(date.getTime())?null:date
}

export function spanOfInterest(items, days, workHours){
    let from = Infinity
    let to = -Infinity

    for(const item of items || []){
        // Three shapes reach this: a schedule entry carries what the server
        // sent (an ISO string), an entry being previewed carries a Date, and
        // a Google event carries milliseconds. `minutesOfDay` wants a Date, so
        // the coercion happens here rather than at three call sites — the
        // first version skipped it and the whole calendar went down on
        // "d.getHours is not a function".
        const start = toDate(item && item.start)
        const end = toDate(item && item.end)
        if(!start || !end) continue

        // Clamped into the day. An entry that began the evening before is
        // drawn from midnight here, and taking its real start would drag the
        // view to 22:00 on a day where nothing happens before nine.
        const startMin = Math.max(0, minutesOfDay(start))
        const endMin = minutesOfDay(end)
        from = Math.min(from, startMin)
        // Midnight as an END means the next day, not the same one — and so
        // does any end that lands before its own start.
        to = Math.max(to, endMin <= startMin?1440:endMin)
    }

    if(from === Infinity){
        for(const day of days || []){
            const hours = (workHours || []).find(h => h.weekday === day.getDay())
            if(!hours) continue
            from = Math.min(from, Number(hours.startMin) || 0)
            to = Math.max(to, Number(hours.endMin) || 0)
        }
    }

    if(from === Infinity) return {fromMin: FALLBACK_FROM, toMin: FALLBACK_TO}
    // A block of no height would ask to be centred on nothing.
    if(to <= from) to = Math.min(1440, from + 60)
    return {fromMin: from, toMin: to}
}

export function TimeGrid({days, entries, external = [], workHours = [], taskInfo = {}, onCreate, onMove, onOpen, onOpenTask}){
    const elGrid = useRef()
    const elBody = useRef()
    const [drag, setDrag] = useState(null)
    const [nowMin, setNowMin] = useState(minutesOfDay(new Date()))

    // Rote Jetzt-Linie aktuell halten
    useEffect(() => {
        const id = setInterval(() => setNowMin(minutesOfDay(new Date())), 60 * 1000)
        return () => clearInterval(id)
    }, [])

    /**
     * Put the day's content on screen, once, without ever fighting the person.
     *
     * Two rules, and both of them are the difference between helpful and
     * infuriating:
     *
     *   - once per visible range. The entries arrive after the first paint, so
     *     this cannot be a mount-only effect — but re-running it on every
     *     change to `entries` would yank the view back under somebody's hands
     *     the moment they drag one.
     *   - the moment the scroll position is moved by hand, this stops for that
     *     range. Somebody who scrolled to 06:00 to look at something meant it.
     *
     * Paging to another week is a new range and starts again, which is the
     * behaviour you want: a fresh week opens on its own content.
     */
    const rangeKey = `${days.length}:${days[0]?+days[0]:0}`
    const autoScroll = useRef({key: null, mine: -1, byHand: false, done: false})

    useEffect(() => {
        const body = elBody.current
        if(!body) return

        function onScroll(){
            const state = autoScroll.current
            // Our own assignment fires this too. Anything further than a
            // rounding difference from what we set was a hand.
            if(Math.abs(body.scrollTop - state.mine) > 2) state.byHand = true
        }

        body.addEventListener('scroll', onScroll, {passive: true})
        return () => body.removeEventListener('scroll', onScroll)
    }, [])

    useLayoutEffect(() => {
        const body = elBody.current
        const grid = elGrid.current
        if(!body || !grid) return

        const state = autoScroll.current
        if(state.key !== rangeKey){
            state.key = rangeKey
            state.byHand = false
            state.done = false
        } else if(state.byHand || state.done){
            return
        }

        const height = grid.offsetHeight
        if(!height) return

        // From the props, deliberately, and not from `shown`: that one carries
        // the drag preview, so depending on it would recompute the scroll
        // target on every mouse move while somebody is moving an entry.
        const items = [
            ...(entries || []),
            ...(external || []).filter(e => e && !e.isAllDay)
        ]
        const {fromMin, toMin} = spanOfInterest(items, days, workHours)
        const gridTop = grid.offsetTop
        const perMin = height / 1440
        // The sticky header and the all-day row sit above the grid inside the
        // same scroller, so the visible height of the grid is what is left.
        const view = Math.max(0, body.clientHeight - (gridTop - body.offsetTop))
        const blockPx = (toMin - fromMin) * perMin

        // Centred only when the whole block fits. Centring a block taller than
        // the window opens BELOW its first entry, which is the one thing this
        // was supposed to stop.
        const target = blockPx < view
            ?gridTop + fromMin * perMin - (view - blockPx) / 2
            :gridTop + fromMin * perMin - AIR_ABOVE_PX

        const next = Math.max(0, Math.min(body.scrollHeight - body.clientHeight, Math.round(target)))
        state.mine = next
        // Only finished once there was something real to go by, so the first
        // paint — before the entries arrive — does not lock in the fallback.
        state.done = items.length > 0
        body.scrollTop = next
    }, [rangeKey, entries, external, workHours])

    /**
     * Measurements are taken from the grid element. The columns themselves sit
     * in a display:contents wrapper and would have no box of their own.
     */
    function gridBox(){
        const box = elGrid.current.getBoundingClientRect()
        return {top: box.top, height: box.height, left: box.left + GUTTER_PX, width: box.width - GUTTER_PX}
    }

    /** Pixelposition -> Minuten seit Mitternacht, auf SNAP gerundet. */
    function minutesFromEvent(ev){
        const box = gridBox()
        return snapMinutes(((ev.clientY - box.top) / box.height) * 1440, SNAP)
    }

    /** Pixel position -> column index (for moving between days). */
    function dayIndexFromEvent(ev){
        const box = gridBox()
        const idx = Math.floor(((ev.clientX - box.left) / box.width) * days.length)
        return Math.max(0, Math.min(days.length - 1, idx))
    }

    function onGridMouseDown(ev, dayIdx){
        if(ev.button !== 0) return
        const min = minutesFromEvent(ev)
        setDrag({mode: 'create', dayIdx, anchorMin: min, fromMin: min, toMin: min, moved: false})
    }

    function onEventMouseDown(ev, item, mode){
        if(ev.button !== 0) return
        ev.stopPropagation()
        const entryStart = new Date(item.entry.start)
        const entryEnd = new Date(item.entry.end)
        setDrag({
            mode,
            entry: item.entry,
            grabMin: minutesFromEvent(ev),
            origStart: entryStart,
            origEnd: entryEnd,
            durationMin: (entryEnd - entryStart) / MS_MIN,
            dayIdx: days.findIndex(d => isSameDay(d, entryStart)),
            deltaMin: 0,
            moved: false
        })
    }

    useEffect(() => {
        if(!drag) return

        function onMove_(ev){
            const min = minutesFromEvent(ev)
            setDrag(d => {
                if(!d) return d
                if(d.mode === 'create'){
                    const moved = d.moved || Math.abs(min - d.anchorMin) >= MIN_DRAG_MINUTES
                    return {...d, fromMin: Math.min(d.anchorMin, min), toMin: Math.max(d.anchorMin, min), moved}
                }
                if(d.mode === 'move'){
                    const dayIdx = dayIndexFromEvent(ev)
                    const deltaMin = min - d.grabMin
                    const moved = d.moved || Math.abs(deltaMin) >= SNAP || dayIdx !== d.dayIdx
                    return {...d, deltaMin, targetDayIdx: dayIdx, moved}
                }
                // resize
                const endMin = Math.max(min, minutesOfDay(d.origStart) + MIN_DRAG_MINUTES)
                return {...d, endMin, moved: d.moved || endMin !== minutesOfDay(d.origEnd)}
            })
        }

        function onUp(){
            setDrag(d => {
                if(!d) return null
                finishDrag(d)
                return null
            })
        }

        window.addEventListener('mousemove', onMove_)
        window.addEventListener('mouseup', onUp)
        return () => {
            window.removeEventListener('mousemove', onMove_)
            window.removeEventListener('mouseup', onUp)
        }
    }, [drag, days])

    function finishDrag(d){
        if(d.mode === 'create'){
            const base = startOfDay(days[d.dayIdx])
            const fromMin = d.moved?d.fromMin:d.anchorMin
            const toMin = d.moved?d.toMin:Math.min(d.anchorMin + DEFAULT_MINUTES, 1440)
            if(toMin - fromMin < 5) return
            onCreate({
                start: new Date(base.getTime() + fromMin * MS_MIN),
                end: new Date(base.getTime() + toMin * MS_MIN)
            })
            return
        }

        // A press that did not move is a click, and a click is about the task.
        if(!d.moved){
            onOpenTask(d.entry);
            return
        }

        if(d.mode === 'move'){
            const targetDay = days[d.targetDayIdx ?? d.dayIdx]
            const newStartMin = snapMinutes(minutesOfDay(d.origStart) + d.deltaMin, SNAP)
            const base = startOfDay(targetDay)
            const start = new Date(base.getTime() + newStartMin * MS_MIN)
            const end = new Date(start.getTime() + d.durationMin * MS_MIN)
            onMove(d.entry, {start, end})
            return
        }

        const base = startOfDay(d.origStart)
        const end = new Date(base.getTime() + d.endMin * MS_MIN)
        if(end - d.origStart < 5 * MS_MIN) return
        onMove(d.entry, {start: d.origStart, end})
    }

    /** Preview while dragging instead of the saved times. */
    function previewFor(entry){
        if(!drag || !drag.entry || drag.entry._id !== entry._id || !drag.moved) return null
        if(drag.mode === 'move'){
            const targetDay = days[drag.targetDayIdx ?? drag.dayIdx]
            const base = startOfDay(targetDay)
            const startMin = snapMinutes(minutesOfDay(drag.origStart) + drag.deltaMin, SNAP)
            const start = new Date(base.getTime() + startMin * MS_MIN)
            return {...entry, start, end: new Date(start.getTime() + drag.durationMin * MS_MIN)}
        }
        const base = startOfDay(drag.origStart)
        return {...entry, start: drag.origStart, end: new Date(base.getTime() + drag.endMin * MS_MIN)}
    }

    const shown = [...entries.map(e => previewFor(e) || e), ...asEntries(external, t('calendar.noTitle'))]
    // Whole-day events would otherwise fill a column from top to bottom and
    // bury everything under them, so they get a row of their own above the
    // grid — the same place every calendar puts them.
    const allDay = (external || []).filter(e => e.isAllDay)

    return (
        <div className="cal-body" ref={elBody}>
            <div className="cal-head" style={{'--cal-cols': days.length}}>
                <div className="cal-head-gutter"/>
                {days.map(day => {
                    const weekend = [0, 6].includes(day.getDay())
                    return (
                        <div key={+day} className={`cal-head-day${isToday(day)?' is-today':''}${weekend?' is-weekend':''}`}>
                            <div className="cal-head-name">{WEEKDAYS_SHORT[(day.getDay() + 6) % 7]}</div>
                            <div className="cal-head-num">{day.getDate()}</div>
                        </div>
                    )
                })}
            </div>

            {allDay.length > 0 && (
                <div className="cal-allday" style={{'--cal-cols': days.length}}>
                    <div className="cal-allday-gutter">{t('calendar.allDay')}</div>
                    {days.map(day => (
                        <div className="cal-allday-col" key={+day}>
                            {allDay.filter(e => e.start < +addDays(startOfDay(day), 1) && e.end > +startOfDay(day)).map(e => (
                                <div className="cal-allday-chip is-external" key={e.id}
                                    title={`${e.title || t('calendar.noTitle')}\n${t('calendar.fromGoogle')}`}>
                                    {e.title || t('calendar.noTitle')}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}

            <div className="cal-grid" ref={elGrid} style={{'--cal-cols': days.length}}>
                <div className="cal-gutter">
                    {Array.from({length: 24}, (_, h) => (
                        <div className="cal-gutter-hour" key={h}>
                            <span>{h?`${pad(h)}:00`:''}</span>
                        </div>
                    ))}
                </div>

                <div className="cal-col-wrap">
                    {days.map((day, dayIdx) => {
                        const items = layoutDay(shown, day)
                        const weekend = [0, 6].includes(day.getDay())
                        const today = isToday(day)
                        const isDraftHere = drag?.mode === 'create' && drag.dayIdx === dayIdx
                        const draftFrom = isDraftHere?(drag.moved?drag.fromMin:drag.anchorMin):0
                        const draftTo = isDraftHere
                            ?(drag.moved?drag.toMin:Math.min(drag.anchorMin + DEFAULT_MINUTES, 1440))
                            :0

                        return (
                            <div key={+day} className={`cal-col${weekend?' is-weekend':''}${today?' is-today':''}`} onMouseDown={ev => onGridMouseDown(ev, dayIdx)}>
                                {/* Outside the working hours. Drawn first and
                                    without pointer events, so it changes how
                                    the day reads and nothing else. */}
                                {offHoursOf(workHours, day).map((band, i) => (
                                    <div key={'off' + i} className="cal-offhours" style={{
                                        '--top': `${band.topPct}%`, '--height': `${band.heightPct}%`
                                    }}/>
                                ))}

                                {Array.from({length: 48}, (_, i) => (
                                    <div key={i} className={`cal-hourline${i % 2 === 1?' is-hour':''}`}/>
                                ))}

                                {today && (
                                    <div className="cal-now" style={{'--top': `${(nowMin / 1440) * 100}%`}}/>
                                )}

                                {isDraftHere && draftTo > draftFrom && (
                                    <div className="cal-draft" style={{
                                        '--top': `${(draftFrom / 1440) * 100}%`,
                                        '--height': `${((draftTo - draftFrom) / 1440) * 100}%`
                                    }}>
                                        {fmtTime(new Date(startOfDay(day).getTime() + draftFrom * MS_MIN))} –{' '}
                                        {fmtTime(new Date(startOfDay(day).getTime() + draftTo * MS_MIN))}
                                    </div>
                                )}

                                {items.map(item => {
                                    const isDragging = drag?.entry?._id === item.entry._id && drag.moved
                                    const width = 100 / item.cols
                                    const short = item.heightPct < 3.2
                                    const isExternal = Boolean(item.entry.isExternal)

                                    /**
                                     * An entry from Google is shown and nothing else.
                                     *
                                     * No drag, no resize handle, no dialog — it belongs to
                                     * another system and this one only holds a copy. The
                                     * mousedown is swallowed all the same: without that,
                                     * pressing on it would fall through to the column
                                     * underneath and start creating an entry.
                                     */
                                    if(isExternal) return (
                                        <div key={item.entry._id} className="cal-event is-external"
                                            title={`${item.entry.taskTitle}\n${fmtTime(item.start)}–${fmtTime(item.end)}\n${t('calendar.fromGoogle')}`}
                                            onMouseDown={ev => ev.stopPropagation()}
                                            style={{
                                                '--top': `${item.topPct}%`,
                                                '--height': `${item.heightPct}%`,
                                                '--left': `${item.col * width}%`,
                                                '--width': `${width}%`
                                            }}>
                                            {short?(
                                                <div className="cal-event-short">
                                                    <span className="cal-event-title">{item.entry.taskTitle}</span>
                                                    <span className="cal-event-sub">{fmtTime(item.start)}</span>
                                                </div>
                                            ):(
                                                <>
                                                    <div className="cal-event-title">{item.entry.taskTitle}</div>
                                                    <div className="cal-event-sub">
                                                        {fmtTime(item.start)}–{fmtTime(item.end)}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )

                                    return (
                                        <div key={item.entry._id} className={`cal-event${isDragging?' is-dragging':''}` +
                                            // Laid by the planner. Still movable — and
                                            // moving one makes it yours, which the server
                                            // records. See schedule.repo.
                                            `${item.entry.source === 'auto'?' is-planned':''}` +
                                            `${item.entry.isAssumed?' is-assumed':''}` +
                                            `${item.continuesBefore?' is-continues-before':''}` +
                                            `${item.continuesAfter?' is-continues-after':''}`} title={`${item.entry.taskTitle}\n${fmtTime(item.start)}–${fmtTime(item.end)}\n${item.entry.boardTitle} · ${item.entry.groupTitle}`} style={{
                                            '--entry-color': item.entry.color || '#0073ea',
                                            '--top': `${item.topPct}%`,
                                            '--height': `${item.heightPct}%`,
                                            '--left': `${item.col * width}%`,
                                            '--width': `${width}%`
                                        }} onMouseDown={ev => onEventMouseDown(ev, item, 'move')}
                                        // Reachable without a mouse. The block
                                        // itself cannot be a <button> — it is
                                        // dragged, and a button swallows that —
                                        // so it carries the role instead, and
                                        // the pencil inside it is a real one.
                                        role="button" tabIndex={0}
                                        onKeyDown={ev => {
                                            if(ev.key !== 'Enter' && ev.key !== ' ') return
                                            ev.preventDefault()
                                            onOpenTask(item.entry)
                                        }}>
                                            <button type="button" className="cal-event-edit"
                                                title={t('calendar.editEntry')}
                                                aria-label={t('calendar.editEntry')}
                                                // Swallowed here, not in onClick:
                                                // without this the press starts a
                                                // drag on the block underneath and
                                                // the click never arrives.
                                                onMouseDown={ev => ev.stopPropagation()}
                                                onClick={ev => {
                                                    ev.stopPropagation()
                                                    onOpen(item.entry)
                                                }}>
                                                <Icon name="pen"/>
                                            </button>
                                            <EntryMarks info={taskInfo[taskKey(item.entry.boardId, item.entry.taskId)]}/>
                                            {short?(
                                                <div className="cal-event-short">
                                                    <span className="cal-event-title">{item.entry.taskTitle}</span>
                                                    <span className="cal-event-sub">{fmtTime(item.start)}</span>
                                                </div>
                                            ):(
                                                <>
                                                    <div className="cal-event-title">{item.entry.taskTitle}</div>
                                                    <div className="cal-event-sub">
                                                        {fmtTime(item.start)}–{fmtTime(item.end)} · {fmtDuration(item.end - item.start)}
                                                    </div>
                                                    {item.heightPct > 8 && (
                                                        <div className="cal-event-sub">{item.entry.boardTitle}</div>
                                                    )}
                                                </>
                                            )}
                                            <div className="cal-event-handle" onMouseDown={ev => onEventMouseDown(ev, item, 'resize')}/>
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
