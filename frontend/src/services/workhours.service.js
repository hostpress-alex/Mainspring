import {httpService} from './http.service'

/**
 * Working hours, and the numbers a week is measured against.
 *
 * Times are minutes since midnight everywhere — in the database, over the
 * wire and in the components. Only the two functions at the bottom turn them
 * into something a person reads, and only at the moment of drawing.
 */

const BASE = 'workhours/'

/** 0 = Sunday, like Date.getDay(). The display order starts at Monday. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

/** What "Mo–Fr, 9 to 5, half an hour for lunch" looks like. */
export const DEFAULT_WEEK = [1, 2, 3, 4, 5].map(weekday => ({
    weekday, startMin: 9 * 60, endMin: 17 * 60, breakMin: 30
}))

export function myWorkHours(){
    return httpService.get(BASE + 'mine')
}

export function workHoursOf(userId){
    return httpService.get(BASE + userId)
}

export function workHoursOfAll(userIds){
    return httpService.get(BASE + 'all', {userIds: (userIds || []).join(',')})
}

export function saveWorkHours(userId, days){
    return httpService.put(BASE + userId, {days})
}

/** The four numbers for a window, for the person asking. */
export function weekSummary(from, to){
    return httpService.get(BASE + 'summary', {from: +from, to: +to})
}

/* ------------------------------------------------------------ reading -- */

export function minutesOfDay(day){
    if(!day) return 0
    return Math.max(0, day.endMin - day.startMin - (day.breakMin || 0))
}

export function weekMinutes(days){
    return (days || []).reduce((sum, day) => sum + minutesOfDay(day), 0)
}

/** 540 -> "09:00". Not a locale question: this is a clock, not a date. */
export function toClock(minutes){
    const m = Math.max(0, Math.min(24 * 60, Math.round(Number(minutes) || 0)))
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** "09:00" -> 540, and anything else -> null. */
export function fromClock(value){
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim())
    if(!match) return null
    const h = Number(match[1]), m = Number(match[2])
    if(h > 24 || m > 59 || (h === 24 && m > 0)) return null
    return h * 60 + m
}

/** 450 -> "7,5 Std." — hours with at most one decimal, in the account's language. */
export function asHours(minutes, language){
    const hours = (Number(minutes) || 0) / 60
    const rounded = Math.round(hours * 10) / 10
    return new Intl.NumberFormat(language || undefined, {maximumFractionDigits: 1}).format(rounded)
}
