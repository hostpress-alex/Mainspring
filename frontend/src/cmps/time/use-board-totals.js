import {useState, useEffect} from 'react'
import {timeService} from '../../services/time.service'
import {useTimesChanged} from './use-running-timer'

/**
 * How much time is on each task of a board.
 *
 * Every row wants its own number, and a board has hundreds of rows — so the
 * request is made once per board, not once per row. The rows share the same
 * promise while it is in flight and the same object afterwards.
 *
 * The server answers with one row per task from a grouped query rather than
 * with every interval, because adding them up in the browser would mean
 * shipping a few thousand rows to print a few dozen numbers.
 */
const cache = new Map()      // boardId -> {totals, promise, epoch}
const listeners = new Set()

function publish(){
    for(const notify of listeners) notify({})
}

/**
 * Fetch at most once per board per epoch.
 *
 * The epoch is what makes this safe to call from every row: the first row to
 * ask starts the request, the other three hundred get the same promise back.
 * Dropping the cache before loading — which is what the first version did —
 * turned that into one request per row, because each row cleared what the row
 * before it had just put there.
 */
async function load(boardId, epoch){
    const entry = cache.get(boardId)
    if(entry && entry.epoch === epoch) return entry.promise || entry.totals
    const promise = timeService.totals(boardId)
        .then(({totals}) => {
            cache.set(boardId, {totals: totals || {}, epoch})
            publish()
            return totals || {}
        })
        .catch(() => {
            // No totals is a column that stays empty, not a broken board.
            cache.set(boardId, {totals: {}, epoch})
            publish()
            return {}
        })
    cache.set(boardId, {...(entry || {}), epoch, promise})
    return promise
}

/** Drop what we know, so the next render asks again. */
export function forgetTotals(boardId){
    if(boardId) cache.delete(boardId)
    else cache.clear()
}

export function useBoardTotals(boardId){
    const changed = useTimesChanged()
    const [, bump] = useState(0)

    useEffect(() => {
        const notify = () => bump(n => n + 1)
        listeners.add(notify)
        return () => { listeners.delete(notify) }
    }, [])

    useEffect(() => {
        if(!boardId) return
        // `changed` bumps whenever a timer is written anywhere. Passing it
        // through as the epoch is what turns "the numbers are one edit old"
        // into exactly one new request, shared by every row again.
        load(boardId, changed)
    }, [boardId, changed])

    return (cache.get(boardId) || {}).totals || {}
}

/**
 * The same, for several boards at once.
 *
 * The calendar needs it: one week can hold blocks from three boards, and the
 * totals endpoint answers per board. Every id goes through the same cache and
 * the same epoch as `useBoardTotals`, so a board already loaded by a row on
 * screen is not fetched a second time.
 *
 * Returns one flat map, keyed `boardId:taskId`. NOT keyed by task id alone:
 * task ids are only unique within their board, and a calendar is the one place
 * where two boards' tasks sit in the same list.
 */
export function useTotalsForBoards(boardIds = []){
    const changed = useTimesChanged()
    const [, bump] = useState(0)
    // A stable key, so a new array of the same ids does not re-fetch.
    const key = [...new Set(boardIds.filter(Boolean).map(String))].sort().join(',')

    useEffect(() => {
        const notify = () => bump(n => n + 1)
        listeners.add(notify)
        return () => { listeners.delete(notify) }
    }, [])

    useEffect(() => {
        if(!key) return
        for(const boardId of key.split(',')) load(boardId, changed)
    }, [key, changed])

    const out = {}
    if(key){
        for(const boardId of key.split(',')){
            const totals = (cache.get(boardId) || {}).totals || {}
            for(const [taskId, ms] of Object.entries(totals)) out[`${boardId}:${taskId}`] = ms
        }
    }
    return out
}
