import {httpService} from './http.service'
import {socketService} from './socket.service'

/**
 * The global priority list, held once for the whole application.
 *
 * Priorities are not board data. They are one list an admin maintains, every
 * board points into it, and a task stores the id rather than the text — so a
 * rename is one row in the database and no task is touched.
 *
 * The consequence for the frontend is this file. Half a dozen places need to
 * turn an id into a colour and a word *while rendering* — the cell, the
 * filter, the summary row, the kanban card, the automation builder — and
 * rendering cannot await. So the list is fetched once, kept in a module
 * variable, and read synchronously from there. `usePriorities` exists for the
 * components that must re-render when it changes; `priorityList()` is for the
 * pure helpers that only need the current answer.
 *
 * Same shape as the other shared stores in this codebase (column widths, the
 * running timer, reactions): one cache, one set of subscribers, one request
 * in flight at a time — because fifteen rows asking for the same list is
 * fifteen requests and one of them is enough.
 */
import {useEffect, useState} from 'react'

const SOCKET_EVENT_PRIORITIES_CHANGED = 'priorities-changed'

let list = []
let loaded = false
let inFlight = null
let isListening = false
const subscribers = new Set()

function publish(){
    subscribers.forEach(fn => {
        try {
            fn(list)
        } catch(err) {
            console.error('priority subscriber failed', err)
        }
    })
}

async function load(){
    if(inFlight) return await inFlight
    inFlight = httpService.get('priority')
        .then(res => {
            list = Array.isArray(res && res.priorities)?res.priorities:[]
            loaded = true
            publish()
            return list
        })
        .catch(err => {
            console.error('cannot load the priorities', err)
            return list
        })
        .finally(() => {
            inFlight = null
        })
    return await inFlight
}

/**
 * Told, not sent: the server says the list moved, everybody fetches it.
 *
 * The alternative — shipping the change itself — means fifteen clients each
 * applying an edit that may have crossed with another one, and no two of them
 * ending up with the same list. One request each, when an admin renames
 * something, is not a cost worth optimising.
 */
function listenOnce(){
    if(isListening) return
    isListening = true
    socketService.on(SOCKET_EVENT_PRIORITIES_CHANGED, () => {
        load()
    })
}

/** The list as it is right now. Empty until the first load has come back. */
export function priorityList(){
    if(!loaded) ensureLoaded()
    return list
}

/** One priority by id, or null. The lookup every cell does. */
export function priorityById(id){
    if(!id) return null
    return priorityList().find(p => p.id === id) || null
}

/** Start the first fetch. Safe to call from anywhere, as often as you like. */
export function ensureLoaded(){
    listenOnce()
    if(!loaded && !inFlight) load()
    return list
}

/** Fetch again — after an admin has changed something in this very tab. */
export function refreshPriorities(){
    loaded = false
    return load()
}

/* --------------------------------------------------------- admin writes -- */

/**
 * The list with a usage count on each entry. Admin only, and separate from
 * the plain list on purpose: the counts cost a pass over every task, and the
 * board does not need them to draw a cell.
 */
export async function listWithUsage(){
    const res = await httpService.get('priority/usage')
    return Array.isArray(res && res.priorities)?res.priorities:[]
}

/**
 * The four writes. Each one refreshes this tab straight away rather than
 * waiting for its own socket event to come back — the person who just clicked
 * should not be the last to see it.
 */
export async function createPriority({title, color}){
    const made = await httpService.post('priority', {title, color})
    await refreshPriorities()
    return made
}

export async function updatePriority(id, patch){
    const saved = await httpService.put('priority/' + id, patch)
    await refreshPriorities()
    return saved
}

export async function reorderPriorities(ids){
    const res = await httpService.put('priority/order', {ids})
    await refreshPriorities()
    return res
}

/**
 * Delete, and say where the tasks that used it should go.
 *
 * The server refuses without a destination as soon as anything uses the
 * priority — see priority.service. That refusal carries the count, so the
 * screen can name the number before asking.
 */
export async function removePriority(id, reassignTo = null){
    const res = await httpService.delete('priority/' + id, reassignTo?{reassignTo}:undefined)
    await refreshPriorities()
    return res
}

/**
 * Subscribe a component to the list.
 *
 * Returns the current value immediately, so a first render is never empty
 * once the list has been fetched by somebody else.
 */
export function usePriorities(){
    const [value, setValue] = useState(list)

    useEffect(() => {
        subscribers.add(setValue)
        ensureLoaded()
        // Between the render and this effect another component may have
        // finished the fetch. Without this, that component would re-render
        // and this one would sit on an empty list until the next change.
        if(list !== value) setValue(list)
        return () => subscribers.delete(setValue)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return value
}
