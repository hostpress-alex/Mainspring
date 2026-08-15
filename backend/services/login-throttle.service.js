/**
 * Slows down password guessing.
 *
 * Nothing stopped anyone from trying passwords as fast as the server could
 * answer. bcrypt makes each attempt cost something, but "something" is a few
 * hundred milliseconds, and a weak password does not survive a night of that.
 *
 * Two counters, because there are two shapes of attack:
 *
 *   - one account, many passwords  -> counted per (address + username)
 *   - one password, many accounts  -> counted per address alone, which the
 *     first counter never notices because every username is fresh
 *
 * Kept in memory on purpose. Reaching for Redis for fifteen people would be
 * silly, and the trade-off is written down rather than hidden: a restart
 * clears the counters, and a second process would count separately. Both are
 * fine here and neither would be on a public service.
 */

/** How long failures are remembered. */
const WINDOW_MS = 15 * 60 * 1000

/** Failed attempts against one account from one address. */
const MAX_PER_ACCOUNT = 10

/** Failed attempts from one address across all accounts. */
const MAX_PER_ADDRESS = 30

/** Hard ceiling on tracked keys, so a flood of addresses cannot eat memory. */
const MAX_KEYS = 10000

const attempts = new Map()

const now = () => Date.now()

function bucket(key, at){
    const found = attempts.get(key)
    if(found && at - found.firstAt < WINDOW_MS) return found

    const fresh = {count: 0, firstAt: at}
    attempts.set(key, fresh)
    return fresh
}

/** Drop everything past its window. Cheap, and only runs while recording. */
function sweep(at){
    for(const [key, entry] of attempts){
        if(at - entry.firstAt >= WINDOW_MS) attempts.delete(key)
    }
    if(attempts.size <= MAX_KEYS) return

    // Still too many after sweeping: give up the oldest. Map keeps insertion
    // order, so the front of it is the oldest.
    const excess = attempts.size - MAX_KEYS
    let dropped = 0
    for(const key of attempts.keys()){
        attempts.delete(key)
        if(++dropped >= excess) break
    }
}

const accountKey = (address, username) => `a:${address}|${String(username || '').toLowerCase()}`
const addressKey = address => `i:${address}`

/**
 * May this address try this username right now?
 * Returns { allowed } or { allowed: false, retryAfter } in whole seconds.
 */
function check(address, username, at = now()){
    const pairs = [
        [attempts.get(accountKey(address, username)), MAX_PER_ACCOUNT],
        [attempts.get(addressKey(address)), MAX_PER_ADDRESS]
    ]

    let longestWait = 0
    for(const [entry, max] of pairs){
        if(!entry) continue
        const age = at - entry.firstAt
        if(age >= WINDOW_MS || entry.count < max) continue
        longestWait = Math.max(longestWait, WINDOW_MS - age)
    }

    if(!longestWait) return {allowed: true}
    return {allowed: false, retryAfter: Math.ceil(longestWait / 1000)}
}

function recordFailure(address, username, at = now()){
    sweep(at)
    bucket(accountKey(address, username), at).count++
    bucket(addressKey(address), at).count++
}

/**
 * Clears the counter for that one account. The per-address counter stays:
 * one correct password should not wipe out thirty wrong guesses at thirty
 * other accounts from the same place.
 */
function recordSuccess(address, username){
    attempts.delete(accountKey(address, username))
}

/** Tests only. */
function reset(){
    attempts.clear()
}

module.exports = {
    check,
    recordFailure,
    recordSuccess,
    reset,
    WINDOW_MS,
    MAX_PER_ACCOUNT,
    MAX_PER_ADDRESS
}
