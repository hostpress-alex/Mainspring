import { monthGrid, isToday, isSameDay, startOfDay, addDays, fmtTime, WEEKDAYS_SHORT, MS_MIN } from '../../services/date.util'

const MAX_CHIPS = 3

/**
 * Monatsansicht: 6 feste Wochenzeilen, damit das Raster beim Blaettern nicht
 * springt. Klick auf eine Zelle legt einen Eintrag ab 09:00 an, Klick auf einen
 * Chip oeffnet ihn.
 */
export function MonthGrid ({ date, entries, onCreate, onOpen, onPickDay }) {
    const days = monthGrid(date)
    const rows = Array.from({ length: 6 }, (_, i) => days.slice(i * 7, i * 7 + 7))
    const month = date.getMonth()

    function entriesOf (day) {
        const from = startOfDay(day)
        const to = addDays(from, 1)
        return entries
            .filter(e => new Date(e.end) > from && new Date(e.start) < to)
            .sort((a, b) => new Date(a.start) - new Date(b.start))
    }

    function onCellMouseDown (ev, day) {
        if (ev.target.closest('.cal-chip') || ev.target.closest('.cal-more')) return
        const start = new Date(startOfDay(day).getTime() + 9 * 60 * MS_MIN)
        onCreate({ start, end: new Date(start.getTime() + 60 * MS_MIN) })
    }

    return (
        <div className='cal-month'>
            <div className='cal-month-head'>
                {WEEKDAYS_SHORT.map(w => <div key={w}>{w}</div>)}
            </div>
            <div className='cal-month-body'>
                {rows.map((row, r) => (
                    <div className='cal-month-row' key={r}>
                        {row.map(day => {
                            const list = entriesOf(day)
                            const outside = day.getMonth() !== month
                            const weekend = [0, 6].includes(day.getDay())
                            return (
                                <div key={+day}
                                    className={`cal-month-cell${outside ? ' is-outside' : ''}` +
                                        `${weekend && !outside ? ' is-weekend' : ''}${isToday(day) ? ' is-today' : ''}`}
                                    onMouseDown={ev => onCellMouseDown(ev, day)}>
                                    <span className='cal-month-num'
                                        onMouseDown={ev => { ev.stopPropagation(); onPickDay(day) }}
                                        title='Tagesansicht oeffnen'>
                                        {day.getDate()}
                                    </span>
                                    {list.slice(0, MAX_CHIPS).map(e => (
                                        <div key={e._id} className='cal-chip'
                                            style={{ background: e.color || '#0073ea' }}
                                            title={`${e.taskTitle}\n${e.boardTitle} · ${e.groupTitle}`}
                                            onMouseDown={ev => { ev.stopPropagation(); onOpen(e) }}>
                                            <span className='cal-chip-time'>{fmtTime(new Date(e.start))}</span>
                                            <span className='cal-chip-title'>{e.taskTitle}</span>
                                        </div>
                                    ))}
                                    {list.length > MAX_CHIPS && (
                                        <span className='cal-more'
                                            onMouseDown={ev => { ev.stopPropagation(); onPickDay(day) }}>
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
