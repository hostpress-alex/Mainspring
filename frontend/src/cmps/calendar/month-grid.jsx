import {
    monthGrid,
    isToday,
    isSameDay,
    startOfDay,
    addDays,
    fmtTime,
    WEEKDAYS_SHORT,
    MS_MIN
} from '../../services/date.util'
import {t} from '../../i18n'
import {EntryMarks} from './entry-marks'
import {taskKey} from '../../services/task-progress'
import {Icon} from '../icon'

const MAX_CHIPS = 3

/**
 * Month view: 6 fixed week rows, so the grid does not jump while paging. A
 * click on a cell creates an entry starting at 09:00; a click on a chip opens
 * the TASK, and the pencil on the chip opens the entry — same split as in the
 * day and week view, and it has to be the same or the calendar teaches two
 * different lessons about the same click.
 */
export function MonthGrid({date, entries, external = [], workHours = [], taskInfo = {}, onCreate, onOpen, onOpenTask, onPickDay}){
    const days = monthGrid(date)
    const rows = Array.from({length: 6}, (_, i) => days.slice(i * 7, i * 7 + 7))
    const month = date.getMonth()

    function entriesOf(day){
        const from = startOfDay(day)
        const to = addDays(from, 1)
        // Own entries and the Google mirror in one list, sorted by time —
        // the day reads as a day, not as two lists. What tells them apart is
        // `isExternal`, which decides both the look and whether a click does
        // anything at all.
        const own = entries.filter(e => new Date(e.end) > from && new Date(e.start) < to)
        const outside = (external || [])
            .filter(e => e.end > +from && e.start < +to)
            .map(e => ({
                _id: 'ext:' + e.id,
                isExternal: true,
                taskTitle: e.title || t('calendar.noTitle'),
                isAllDay: e.isAllDay,
                start: e.start,
                end: e.end
            }))
        return [...own, ...outside].sort((a, b) => new Date(a.start) - new Date(b.start))
    }

    /** A day nobody works is drawn like a weekend, whatever day it is. */
    function isOff(day){
        if(!workHours.length) return false
        return !workHours.some(h => h.weekday === day.getDay())
    }

    function onCellMouseDown(ev, day){
        if(ev.target.closest('.cal-chip') || ev.target.closest('.cal-more')) return
        const start = new Date(startOfDay(day).getTime() + 9 * 60 * MS_MIN)
        onCreate({start, end: new Date(start.getTime() + 60 * MS_MIN)})
    }

    return (
        <div className="cal-month">
            <div className="cal-month-head">
                {WEEKDAYS_SHORT.map(w => <div key={w}>{w}</div>)}
            </div>
            <div className="cal-month-body">
                {rows.map((row, r) => (
                    <div className="cal-month-row" key={r}>
                        {row.map(day => {
                            const list = entriesOf(day)
                            const outside = day.getMonth() !== month
                            const weekend = [0, 6].includes(day.getDay()) || isOff(day)
                            return (
                                <div key={+day} className={`cal-month-cell${outside?' is-outside':''}` +
                                    `${weekend && !outside?' is-weekend':''}${isToday(day)?' is-today':''}`} onMouseDown={ev => onCellMouseDown(ev, day)}>
                                    <span className="cal-month-num" onMouseDown={ev => {
                                        ev.stopPropagation();
                                        onPickDay(day)
                                    }} title={t('calendar.openDayView')}>
                                        {day.getDate()}
                                    </span>
                                    {list.slice(0, MAX_CHIPS).map(e => e.isExternal?(
                                        /* Swallowed, not handled: an entry from Google
                                           opens nothing, and without stopping the event
                                           the cell underneath would start a new one. */
                                        <div key={e._id} className="cal-chip is-external"
                                            title={`${e.taskTitle}\n${t('calendar.fromGoogle')}`}
                                            onMouseDown={ev => ev.stopPropagation()}>
                                            <span className="cal-chip-time">
                                                {e.isAllDay?t('calendar.allDayShort'):fmtTime(new Date(e.start))}
                                            </span>
                                            <span className="cal-chip-title">{e.taskTitle}</span>
                                        </div>
                                    ):(
                                        <div key={e._id} className={`cal-chip${e.source === 'auto'?' is-planned':''}`} style={{'--entry-color': e.color || '#0073ea'}} title={`${e.taskTitle}\n${e.boardTitle} · ${e.groupTitle}`}
                                            role="button" tabIndex={0}
                                            onMouseDown={ev => {
                                                ev.stopPropagation();
                                                onOpenTask(e)
                                            }}
                                            onKeyDown={ev => {
                                                if(ev.key !== 'Enter' && ev.key !== ' ') return
                                                ev.preventDefault()
                                                onOpenTask(e)
                                            }}>
                                            <span className="cal-chip-time">{fmtTime(new Date(e.start))}</span>
                                            <span className="cal-chip-title">{e.taskTitle}</span>
                                            <EntryMarks info={taskInfo[taskKey(e.boardId, e.taskId)]}/>
                                            <button type="button" className="cal-chip-edit"
                                                title={t('calendar.editEntry')}
                                                aria-label={t('calendar.editEntry')}
                                                onMouseDown={ev => {
                                                    // The chip opens the task on
                                                    // mousedown, so the pencil has to
                                                    // stop it there and not wait for
                                                    // the click — by then the page has
                                                    // already changed underneath.
                                                    ev.stopPropagation()
                                                    onOpen(e)
                                                }}>
                                                <Icon name="pen"/>
                                            </button>
                                        </div>
                                    ))}
                                    {list.length > MAX_CHIPS && (
                                        <span className="cal-more" onMouseDown={ev => {
                                            ev.stopPropagation();
                                            onPickDay(day)
                                        }}>
                                            + {list.length - MAX_CHIPS} weitere
                                        </span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                ))}
            </div>
        </div>
    )
}
