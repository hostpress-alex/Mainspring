import {useEffect, useState} from 'react'

import {httpService} from '../../services/http.service'
import {socketService} from '../../services/socket.service'

/**
 * Who has seen which update, for one task.
 *
 * Same shape as the reactions next to it, and for the same reasons: one cache
 * for the whole task rather than one request per comment, one request in
 * flight at a time however many components ask, and a socket event that says
 * only "this task moved" so every client fetches the truth instead of
 * applying a delta that may have crossed with somebody else's.
 *
 * The reporting half is here too. A comment that comes into view does not
 * send a request of its own — the ids are collected for a moment and go in
 * one call, because scrolling through a task puts five updates on screen in
 * two seconds.
 */

const SOCKET_EVENT_SEEN_CHANGED = 'seen-changed'

/** How long ids are collected before they are sent. */
const BATCH_MS = 1200

const cache = new Map()          // key -> {commentId: [{userId, seenAt}]}
const inFlight = new Map()       // key -> promise
const subscribers = new Map()    // key -> Set<fn>
const pending = new Map()        // key -> Set<commentId>
const timers = new Map()         // key -> timeout
let isListening = false

const keyOf = (boardId, taskId) => `${boardId}/${taskId}`

function publish(key){
    const listeners = subscribers.get(key)
    if(!listeners) return
    const value = cache.get(key) || {}
    listeners.forEach(fn => {
        try {
            fn(value)
        } catch(err) {
            console.error('seen subscriber failed', err)
        }
    })
}

async function load(key, boardId, taskId){
    if(inFlight.has(key)) return await inFlight.get(key)
    const request = httpService.get(`seen/task/${boardId}/${taskId}`)
        .then(res => {
            cache.set(key, (res && res.seen) || {})
            publish(key)
            return cache.get(key)
        })
        .catch(err => {
            console.error('cannot load the receipts', err)
            return cache.get(key) || {}
        })
        .finally(() => inFlight.delete(key))
    inFlight.set(key, request)
    return await request
}

function listenOnce(){
    if(isListening) return
    isListening = true
    socketService.on(SOCKET_EVENT_SEEN_CHANGED, payload => {
        if(!payload) return
        const key = keyOf(payload.boardId, payload.taskId)
        // Only tasks somebody is actually looking at. A board room carries
        // events for every task on it.
        if(!cache.has(key)) return
        load(key, payload.boardId, payload.taskId)
    })
}

/**
 * Report that these comments have been on screen.
 *
 * Collected per task and sent once the flow stops for a moment. Ids already
 * known to be recorded are dropped before the call — the common case is a
 * task being opened again, where nothing has changed.
 */
function report(key, boardId, taskId){
    const ids = [...(pending.get(key) || [])]
    pending.delete(key)
    timers.delete(key)
    if(!ids.length) return

    httpService.post(`seen/${boardId}/${taskId}`, {commentIds: ids})
        .then(res => {
            // Only re-read when something was actually new; the answer is
            // usually "nothing", and a fetch for nothing is a fetch too many.
            if(res && res.added) load(key, boardId, taskId)
        })
        .catch(err => console.error('cannot save the receipt', err))
}

export function markSeen(boardId, taskId, commentId, myId){
    if(!boardId || !taskId || !commentId) return
    const key = keyOf(boardId, taskId)

    // Already recorded for me? Then there is nothing to say.
    const known = (cache.get(key) || {})[commentId] || []
    if(myId && known.some(entry => String(entry.userId) === String(myId))) return

    const set = pending.get(key) || new Set()
    set.add(commentId)
    pending.set(key, set)

    if(timers.has(key)) return
    timers.set(key, setTimeout(() => report(key, boardId, taskId), BATCH_MS))
}

export function useCommentSeen(boardId, taskId){
    const key = (boardId && taskId)?keyOf(boardId, taskId):null
    const [value, setValue] = useState(() => (key && cache.get(key)) || {})

    useEffect(() => {
        if(!key) return
        listenOnce()
        const listeners = subscribers.get(key) || new Set()
        listeners.add(setValue)
        subscribers.set(key, listeners)

        if(cache.has(key)) setValue(cache.get(key))
        else load(key, boardId, taskId)

        return () => {
            const set = subscribers.get(key)
            if(!set) return
            set.delete(setValue)
            if(!set.size) subscribers.delete(key)
        }
    }, [key, boardId, taskId])

    return value
}
