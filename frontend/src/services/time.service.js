import {httpService} from './http.service'
import {t} from '../i18n'

const BASE_URL = 'time'

/**
 * Time tracking.
 *
 * Whose time it is never travels in a request — the server takes that from the
 * session. Every call here is about the logged-in person, except the reads,
 * which are about a task and show everybody's.
 */
export const timeService = {
    /** What this person has open right now, or null. */
    running(){
        return httpService.get(`${BASE_URL}/running`)
    },

    /** Every interval on one task, plus the totals. */
    forTask(boardId, taskId){
        return httpService.get(`${BASE_URL}/task/${boardId}/${taskId}`)
    },

    /** One number per task, for the board. */
    totals(boardId){
        return httpService.get(`${BASE_URL}/board/${boardId}/totals`)
    },

    /**
     * Begin.
     *
     * Without `resolve` this fails with 409 when another timer is running, and
     * the answer carries what that is — see readRunningConflict below. Passing
     * `resolve` back closes the other one and starts this one in a single call,
     * so there is no moment in which neither is running.
     */
    start(boardId, taskId, resolve = null){
        return httpService.post(`${BASE_URL}/start`, {boardId, taskId, resolve})
    },

    /**
     * `mode` is 'pause' or 'stop'.
     *
     * `endedAt` is the moment the button was pressed, not the moment this call
     * goes out — the seconds spent writing the note are not work on the task.
     * The server clamps it into [start, now], so it can only ever shorten the
     * entry.
     */
    close({mode = 'stop', note = '', postUpdate = false, endedAt = null} = {}){
        return httpService.post(`${BASE_URL}/close`, {mode, note, postUpdate, endedAt})
    },

    addManual({boardId, taskId, startedAt, endedAt, note = '', postUpdate = false}){
        return httpService.post(`${BASE_URL}/entry`, {boardId, taskId, startedAt, endedAt, note, postUpdate})
    },

    edit(entryId, patch){
        return httpService.patch(`${BASE_URL}/entry/${entryId}`, patch)
    },

    remove(entryId){
        return httpService.delete(`${BASE_URL}/entry/${entryId}`)
    }
}

/**
 * Was this the "something else is already running" refusal?
 *
 * Returns the running entry, or null if the error was anything else. Keeps the
 * axios shape out of the components.
 */
export function readRunningConflict(err){
    const body = err?.response?.data
    if(err?.response?.status === 409 && body?.code === 'ALREADY_RUNNING') return body.running || null
    return null
}

/* ---------------------------------------------------------- formatting -- */

const pad = n => String(n).padStart(2, '0')

/**
 * A running clock: 0:07 → 12:34 → 1:02:03.
 *
 * Seconds are shown while it runs, because a clock that does not move looks
 * broken. They are left out everywhere else.
 */
export function formatClock(ms){
    const total = Math.max(0, Math.floor(Number(ms) / 1000))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    return h?`${h}:${pad(m)}:${pad(s)}`:`${m}:${pad(s)}`
}

/**
 * A finished amount: "40 s", "45 min", "2 h 15 min", "3 h".
 *
 * Rounded to the minute — a total reading 2 h 15 min 37 s implies a precision
 * the underlying clicking does not have. Below a minute it says seconds
 * instead, because rounding there produces "0 min", and an entry that claims
 * to be nothing is exactly the one somebody has to look at and correct.
 */
export function formatDuration(ms){
    const total = Math.max(0, Number(ms) || 0)
    if(total < 60000) return `${Math.round(total / 1000)} ${t('time.secondShort')}`
    const minutes = Math.round(total / 60000)
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if(!h) return `${m} ${t('time.minuteShort')}`
    if(!m) return `${h} ${t('time.hourShort')}`
    return `${h} ${t('time.hourShort')} ${m} ${t('time.minuteShort')}`
}

/** The length of one entry; a running one is measured against now. */
export function spanOf(entry, now = Date.now()){
    if(!entry) return 0
    return (entry.endedAt || now) - entry.startedAt
}

/** `2026-08-18T14:30` for a datetime-local input, in local time. */
export function toInputValue(ms){
    const d = new Date(Number(ms) || Date.now())
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Back again. Returns null for anything the browser did not fill in. */
export function fromInputValue(value){
    if(!value) return null
    const ms = new Date(value).getTime()
    return Number.isFinite(ms)?ms:null
}
