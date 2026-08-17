import {t} from '../i18n'

/**
 * How far away a due date is, in words.
 *
 * The whole difficulty is in one sentence: this counts CALENDAR DAYS, not
 * twenty-four hour blocks.
 *
 * A task due today at midnight, read at six in the evening, is 0.75 days in
 * the past. Divide milliseconds by 86 400 000 and it comes out as "1 day
 * overdue" — on the day it is due, which is the one day it must not say that.
 * The same mistake in the other direction turns "due tomorrow morning" into
 * "due today" all through this afternoon.
 *
 * So both moments are moved to midnight in the reader's own time zone first,
 * and only then compared. The comparison is rounded rather than truncated
 * because two midnights are not always a whole number of days apart: the
 * clocks go forward and one of them is 23 hours long, which would otherwise
 * lose a day twice a year.
 */

const DAY = 24 * 60 * 60 * 1000

/** Midnight of the day this moment falls on, locally. */
function startOfDay(value){
    const date = new Date(value)
    if(Number.isNaN(date.getTime())) return null
    date.setHours(0, 0, 0, 0)
    return date.getTime()
}

/**
 * Whole calendar days from today to that date. Negative is in the past.
 * `null` when there is no usable date.
 */
export function dayDiff(value, now = Date.now()){
    if(value === null || value === undefined || value === '') return null
    const then = startOfDay(value)
    const today = startOfDay(now)
    if(then === null || today === null) return null
    return Math.round((then - today) / DAY)
}

/**
 * The sentence for a due date, or '' when there is none.
 *
 * Yesterday and tomorrow get their own words. "in 1 day" is understood but
 * nobody says it, and a label people have to translate in their head is worse
 * than no label.
 */
export function dueLabel(value, now = Date.now()){
    const days = dayDiff(value, now)
    if(days === null) return ''
    if(days === 0) return t('date.today')
    if(days === 1) return t('date.tomorrow')
    if(days === -1) return t('date.yesterday')
    if(days > 0) return t('date.dueIn', {n: days})
    return t('date.overdue', {n: -days})
}

/**
 * How full the circle in front of the date is, from 0 to 1.
 *
 * It fills over the last week: seven days out and further it is empty, on the
 * day itself it is full, and in between it fills evenly. Somebody glancing
 * down the column sees which dates are closing in without reading a single
 * number.
 *
 * A week rather than a fortnight because that is the horizon people actually
 * plan in, and because a circle that is a third full for three weeks says
 * nothing at all. Past dates return null — those get the exclamation mark
 * instead, and a circle that is "more than full" is not a thing.
 */
const HORIZON = 7

export function dueFill(value, now = Date.now()){
    const days = dayDiff(value, now)
    if(days === null || days < 0) return null
    if(days >= HORIZON) return 0
    return (HORIZON - days) / HORIZON
}

/**
 * A word for the state, for the styling: 'overdue', 'today', 'soon' or ''.
 *
 * 'soon' is the next seven days. A number that has to be agreed on between
 * the stylesheet and the component belongs in exactly one of them, and the
 * stylesheet cannot count days.
 */
export function dueTone(value, now = Date.now()){
    const days = dayDiff(value, now)
    if(days === null) return ''
    if(days < 0) return 'overdue'
    if(days === 0) return 'today'
    if(days <= 7) return 'soon'
    return ''
}
