/**
 * A ceiling on how fast one caller may ask.
 *
 * There has never been one anywhere in this application except on the login
 * form, and inside a VPN with fifteen people that was a defensible gap. It
 * stops being defensible the moment a key exists that can be pasted into a
 * loop, so this arrives together with the API tokens rather than after the
 * first accident.
 *
 * Deliberately a fixed window and not a token bucket. A fixed window lets
 * through up to twice the limit across a boundary — which for a script that is
 * meant to write a few dozen rows is a difference nobody can measure, and the
 * simpler rule is the one that stays correct when somebody edits it in a year.
 *
 * In memory, like the login throttle, and for the same written-down reasons: a
 * restart clears it and a second process would count separately. Fine here,
 * not fine on a public service — and if this ever runs on more than one
 * process, this file is the one that has to move to Redis.
 */

const now = () => Date.now()

/** Hard ceiling on tracked keys, so a flood of callers cannot eat memory. */
const MAX_KEYS = 10000

/**
 * One counter per key per window.
 *
 * Returned rather than thrown so the caller decides what a refusal looks like
 * — an HTTP layer wants a header and a status, a job runner wants to wait.
 */
function createLimiter({limit, windowMs}){
    const hits = new Map()

    function sweep(at){
        for(const [key, entry] of hits){
            if(at - entry.firstAt >= windowMs) hits.delete(key)
        }
        if(hits.size <= MAX_KEYS) return
        const excess = hits.size - MAX_KEYS
        let dropped = 0
        for(const key of hits.keys()){
            hits.delete(key)
            if(++dropped >= excess) break
        }
    }

    /**
     * Count one request against `key`.
     *
     * `{ok, remaining, retryAfterMs}` — `ok` false means it is over the limit
     * and this call was NOT counted, so a caller that keeps hammering does not
     * push its own window further out.
     */
    function take(key){
        const at = now()
        sweep(at)
        const found = hits.get(key)
        const entry = (found && at - found.firstAt < windowMs)?found:{count: 0, firstAt: at}
        if(!found || entry !== found) hits.set(key, entry)

        if(entry.count >= limit){
            return {ok: false, remaining: 0, retryAfterMs: Math.max(0, entry.firstAt + windowMs - at)}
        }
        entry.count++
        return {ok: true, remaining: limit - entry.count, retryAfterMs: 0}
    }

    function reset(){
        hits.clear()
    }

    return {take, reset, limit, windowMs}
}

module.exports = {createLimiter, MAX_KEYS}
