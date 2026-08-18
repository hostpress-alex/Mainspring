import {useEffect, useState} from 'react'
import {reactionService} from '../../services/reaction.service'
import {socketService, SOCKET_EVENT_REACTION_CHANGED} from '../../services/socket.service'

/**
 * Every reaction on one task, shared by all its comments.
 *
 * A thread has an update and a dozen replies, and each of them wants to know
 * what it was given. One request per task rather than one per comment — the
 * server groups them by comment id and everybody reads out of the same object.
 *
 * A click is applied locally first and then sent. The server is the authority
 * on the number, but waiting a round trip to see your own thumb appear makes a
 * button feel broken, and the correction — if the count moved meanwhile — is
 * invisible because it lands within the same second.
 */
const cache = new Map()          // "boardId/taskId" -> reactions
const inFlight = new Map()       // the same key -> the request already running
const listeners = new Set()

const keyOf = (boardId, taskId) => `${boardId}/${taskId}`

function publish(){
    for(const notify of listeners) notify({})
}

/** Fetch what the server holds and tell everyone drawing it. */
async function refresh(key, boardId, taskId){
    try {
        const {reactions} = await reactionService.forTask(boardId, taskId)
        cache.set(key, reactions || {})
    } catch(err){
        cache.set(key, {})
    }
    publish()
}

/**
 * Somebody else reacted — go and look.
 *
 * One subscription for the whole application, not one per comment: the event
 * says which task moved, and whoever holds that task in the cache re-reads it.
 * The event deliberately carries no numbers. A delta applied locally would
 * have to be reconciled with whatever this browser did in the same second,
 * which is the client-to-client relay this codebase already removed once.
 *
 * The socket is in the room of the task whose dialog is open, so this only
 * ever fires for a task somebody is actually looking at.
 */
let isListening = false

function listenOnce(){
    if(isListening) return
    isListening = true
    socketService.on(SOCKET_EVENT_REACTION_CHANGED, payload => {
        if(!payload) return
        const key = keyOf(payload.boardId, payload.taskId)
        // Not open here: nothing to bring up to date.
        if(!cache.has(key)) return
        refresh(key, payload.boardId, payload.taskId)
    })
}

export function useTaskReactions(boardId, taskId){
    const key = keyOf(boardId, taskId)
    const [, bump] = useState(0)

    useEffect(() => {
        const notify = () => bump(n => n + 1)
        listeners.add(notify)
        return () => { listeners.delete(notify) }
    }, [])

    useEffect(() => {
        if(!boardId || !taskId) return
        listenOnce()
        // Every comment in the thread mounts this hook at the same moment.
        // Whoever gets here first makes the request; the rest wait on it.
        if(cache.has(key) || inFlight.has(key)) return

        const request = reactionService.forTask(boardId, taskId)
            .then(({reactions}) => {
                cache.set(key, reactions || {})
                publish()
            })
            .catch(() => {
                // No reactions is a quiet row of buttons, not a broken task.
                cache.set(key, {})
                publish()
            })
            .finally(() => inFlight.delete(key))

        inFlight.set(key, request)
    }, [key, boardId, taskId])

    const reactions = cache.get(key) || {}

    async function toggle(commentId, emoji){
        const forTask = {...(cache.get(key) || {})}
        const forComment = {...(forTask[commentId] || {})}
        const group = forComment[emoji] || {count: 0, mine: false}

        const mine = !group.mine
        const count = group.count + (mine?1:-1)
        if(count <= 0) delete forComment[emoji]
        else forComment[emoji] = {...group, count, mine}

        forTask[commentId] = forComment
        cache.set(key, forTask)
        publish()

        try {
            await reactionService.toggle(boardId, taskId, commentId, emoji)
        } catch(err){
            // Put back what the server actually holds rather than guess.
            await refresh(key, boardId, taskId)
        }
    }

    return {reactions, toggle}
}
