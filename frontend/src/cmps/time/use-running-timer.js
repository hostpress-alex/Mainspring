import {useState, useEffect} from 'react'
import {timeService} from '../../services/time.service'

/**
 * The one running timer, shared by everything that shows it.
 *
 * A person has at most one, and it is drawn in three places at once — the task
 * row, the bar at the top, the panel in the task modal. Component state would
 * mean three copies that disagree the moment one of them starts or stops
 * something, so it lives here and everybody subscribes.
 */
let running = null
let loaded = false
const listeners = new Set()

function publish(){
    for(const notify of listeners) notify(running)
}

export function getRunning(){
    return running
}

/** Overwrite from a server answer we already have in hand. */
export function setRunning(entry){
    running = entry || null
    publish()
}

/** Ask the server. Also what closes a forgotten timer, as a side effect. */
export async function refreshRunning(){
    try {
        const {running: entry} = await timeService.running()
        running = entry || null
    } catch(err){
        running = null
    }
    loaded = true
    publish()
    return running
}

export function useRunningTimer(){
    const [entry, setEntry] = useState(running)
    useEffect(() => {
        listeners.add(setEntry)
        // The first component to want it fetches it; the rest get it free.
        if(!loaded) refreshRunning()
        return () => { listeners.delete(setEntry) }
    }, [])
    return entry
}

/**
 * "Something about the recorded times changed."
 *
 * The history panel and the totals cannot know that a timer somewhere else was
 * stopped. Rather than have every one of them poll, whoever writes says so
 * once and the readers re-fetch. A counter and not an event object: nobody
 * needs to know WHAT changed, only that their copy is old.
 */
let epoch = 0
const epochListeners = new Set()

export function notifyTimesChanged(){
    epoch++
    for(const notify of epochListeners) notify(epoch)
}

export function useTimesChanged(){
    const [value, setValue] = useState(epoch)
    useEffect(() => {
        epochListeners.add(setValue)
        return () => { epochListeners.delete(setValue) }
    }, [])
    return value
}

/**
 * Holding the clock still while the note is being written.
 *
 * Pressing pause is the moment the work stopped. If the clock kept counting
 * behind the dialog, the number on screen and the number being recorded would
 * drift apart for as long as somebody took to type — and the one they watched
 * tick would be the wrong one. So the moment is taken once, everything that
 * draws the clock shows it, and it is what gets sent as the end of the
 * interval. Cancelling lets it go again; nothing was closed.
 */
let frozenAt = null
const clockListeners = new Set()

function publishClock(){
    for(const notify of clockListeners) notify(frozenAt)
}

export function freezeClock(at = Date.now()){
    frozenAt = at
    publishClock()
}

export function releaseClock(){
    frozenAt = null
    publishClock()
}

/** How long the given entry has been running, in milliseconds. */
export function useRunningSpan(entry){
    const [frozen, setFrozen] = useState(frozenAt)

    useEffect(() => {
        clockListeners.add(setFrozen)
        return () => { clockListeners.delete(setFrozen) }
    }, [])

    useTick(Boolean(entry) && frozen === null)

    if(!entry) return 0
    return Math.max(0, (frozen === null?Date.now():frozen) - entry.startedAt)
}

/**
 * A second hand.
 *
 * Re-renders once a second, and only while something is actually running — a
 * clock that stands still looks broken, and one that ticks for nothing costs
 * a render per second per open board for the rest of the day.
 */
export function useTick(active){
    const [, bump] = useState(0)
    useEffect(() => {
        if(!active) return
        const id = setInterval(() => bump(n => n + 1), 1000)
        return () => clearInterval(id)
    }, [active])
}
