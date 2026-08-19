import {httpService} from './http.service'

/**
 * The mirror of somebody's outside calendar.
 *
 * Everything here is read-only by design — there is no create, no update and
 * no delete, because the entries belong to Google and this application only
 * copies them. The one write is "fetch now", which changes nothing over
 * there.
 */

const BASE = 'calendar/'

/** The events of the signed-in person, inside a window. */
export function externalEvents(from, to){
    return httpService.get(BASE + 'events', {from: +from, to: +to})
}

/** Whether Google is set up on this server, and how the last attempt went. */
export function calendarStatus(){
    return httpService.get(BASE + 'status')
}

/** Fetch now, rather than waiting for the timer. */
export function syncNow(userId){
    return httpService.post(BASE + (userId?`sync/${userId}`:'sync'), {})
}

/* --------------------------------------------------------------- admin -- */

export function calendarLinks(){
    return httpService.get(BASE + 'links')
}

export function setCalendarLink(userId, {externalEmail, isEnabled = true}){
    return httpService.put(BASE + 'links/' + userId, {externalEmail, isEnabled})
}

export function removeCalendarLink(userId){
    return httpService.delete(BASE + 'links/' + userId)
}
