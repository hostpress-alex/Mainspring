/**
 * Date and layout helpers for the calendar.
 * All in local time, the week starts on Monday (DIN 1355).
 */
import {getLanguage} from '../i18n'

/**
 * Weekday and month names come from the browser in the active language, so
 * they do not have to be kept in the text catalogue for every language.
 * 2024-01-01 was a Monday, which is why the week starts there.
 */
const named = (options, count, date) => Array.from({length: count}, (unused, i) =>
    new Intl.DateTimeFormat(getLanguage(), options).format(date(i)))

export const WEEKDAYS_SHORT = named({weekday: 'short'}, 7, i => new Date(Date.UTC(2024, 0, 1 + i)))
export const WEEKDAYS_LONG = named({weekday: 'long'}, 7, i => new Date(Date.UTC(2024, 0, 1 + i)))
export const MONTHS = named({month: 'long'}, 12, i => new Date(Date.UTC(2024, i, 1)))

export const MS_MIN = 60 * 1000
export const MS_HOUR = 60 * MS_MIN
export const MS_DAY = 24 * MS_HOUR

export const startOfDay = d => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x
}
export const endOfDay = d => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x
}
export const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x
}
export const addMonths = (d, n) => {
    const x = new Date(d);
    x.setDate(1);
    x.setMonth(x.getMonth() + n);
    return x
}
export const addMinutes = (d, n) => new Date(new Date(d).getTime() + n * MS_MIN)

/** Monday of the week that d falls in. */
export function startOfWeek(d){
    const x = startOfDay(d)
    const shift = (x.getDay() + 6) % 7   // So=0 -> 6, Mo=1 -> 0
    return addDays(x, -shift)
}

export const startOfMonth = d => {
    const x = startOfDay(d);
    x.setDate(1);
    return x
}
export const endOfMonth = d => {
    const x = startOfMonth(d);
    x.setMonth(x.getMonth() + 1);
    return addDays(x, -1)
}

export const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export const isToday = d => isSameDay(d, new Date())

export const pad = n => String(n).padStart(2, '0')

/**
 * "2 days ago", in whatever language the interface is in.
 *
 * Intl does the wording, so this needs no list of German month names and no
 * second list for English — the mistake the weekday and month names above used
 * to make.
 */
export function fmtRelative(value, now = Date.now()){
    const then = value instanceof Date?value.getTime():Number(value)
    if(!Number.isFinite(then)) return ''
    const seconds = Math.round((then - now) / 1000)
    const steps = [
        [60, 'second', 1],
        [3600, 'minute', 60],
        [86400, 'hour', 3600],
        [604800, 'day', 86400],
        [2629800, 'week', 604800],
        [31557600, 'month', 2629800]
    ]
    const fmt = new Intl.RelativeTimeFormat(getLanguage(), {numeric: 'auto'})
    const abs = Math.abs(seconds)
    for(const [limit, unit, divisor] of steps){
        if(abs < limit) return fmt.format(Math.round(seconds / divisor), unit)
    }
    return fmt.format(Math.round(seconds / 31557600), 'year')
}

export const fmtTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`
export const fmtDate = d => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
export const fmtMonthYear = d => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
export const fmtWeekdayLong = d => WEEKDAYS_LONG[(d.getDay() + 6) % 7]

/** Value for <input type="datetime-local"> — local time, no timezone suffix. */
export const toLocalInput = d =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

export const fromLocalInput = value => {
    const [date, time] = String(value).split('T')
    const [y, m, day] = date.split('-').map(Number)
    const [h, min] = (time || '00:00').split(':').map(Number)
    return new Date(y, m - 1, day, h, min, 0, 0)
}

/** Calendar week per ISO 8601. */
export function isoWeek(d){
    const x = startOfDay(d)
    x.setDate(x.getDate() + 3 - ((x.getDay() + 6) % 7))
    const firstThursday = new Date(x.getFullYear(), 0, 4)
    firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7))
    return 1 + Math.round((x - firstThursday) / (7 * MS_DAY))
}

/** The seven days of the week that d falls in. */
export const weekDays = d => Array.from({length: 7}, (_, i) => addDays(startOfWeek(d), i))

/**
 * 6 weeks x 7 days for the month view — always the same height, so the grid
 * does not jump when you page through.
 */
export function monthGrid(d){
    const first = startOfWeek(startOfMonth(d))
    return Array.from({length: 42}, (_, i) => addDays(first, i))
}

export const minutesOfDay = d => d.getHours() * 60 + d.getMinutes()

/** Dauer als "1 h 30 min" / "45 min". */
export function fmtDuration(ms){
    const total = Math.round(ms / MS_MIN)
    const h = Math.floor(total / 60)
    const m = total % 60
    if(!h) return `${m} min`
    if(!m) return `${h} h`
    return `${h} h ${m} min`
}

/**
 * Clips an entry to one day. Returns null if it does not touch that day at
 * all. Needed for entries that run over midnight.
 */
export function clipToDay(entry, day){
    const dayStart = startOfDay(day)
    const dayEnd = addDays(dayStart, 1)
    const start = new Date(entry.start)
    const end = new Date(entry.end)
    if(end <= dayStart || start >= dayEnd) return null
    return {
        entry,
        start: start < dayStart?dayStart:start,
        end: end > dayEnd?dayEnd:end,
        continuesBefore: start < dayStart,
        continuesAfter: end > dayEnd
    }
}

/**
 * Lays overlapping entries out side by side — like in Google Calendar.
 *
 * How: sort by start, split into clusters (connected chains of overlaps),
 * and inside a cluster give every entry the first free column. The width
 * follows from the cluster's column count, so all entries of one cluster
 * are equally wide.
 *
 * Returned per entry: { ...clip, col, cols, topPct, heightPct }
 */
export function layoutDay(entries, day){
    const clips = entries.map(e => clipToDay(e, day)).filter(Boolean)
    clips.sort((a, b) => a.start - b.start || b.end - a.end)

    const out = []
    let cluster = []
    let clusterEnd = null

    const flush = () => {
        if(!cluster.length) return
        const columns = []            // per column, the end of the last entry
        for(const c of cluster){
            let col = columns.findIndex(end => end <= c.start)
            if(col === -1){
                col = columns.length;
                columns.push(c.end)
            } else columns[col] = c.end
            c.col = col
        }
        const cols = columns.length
        for(const c of cluster) out.push({...c, cols})
        cluster = []
        clusterEnd = null
    }

    for(const c of clips){
        if(clusterEnd !== null && c.start >= clusterEnd) flush()
        cluster.push(c)
        clusterEnd = clusterEnd === null?c.end:new Date(Math.max(clusterEnd, c.end))
    }
    flush()

    const dayStart = startOfDay(day)
    return out.map(c => {
        const topMin = (c.start - dayStart) / MS_MIN
        const heightMin = Math.max((c.end - c.start) / MS_MIN, 15)   // minimum height so it stays clickable
        return {...c, topPct: (topMin / 1440) * 100, heightPct: (heightMin / 1440) * 100}
    })
}

/** Round to a grid (e.g. 15 minutes) — for dragging and creating. */
export function snapMinutes(minutes, step = 15){
    return Math.max(0, Math.min(1440, Math.round(minutes / step) * step))
}
