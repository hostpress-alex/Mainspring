/**
 * Is the board column open?
 *
 * One answer for the whole application, and it belongs to the user alone.
 *
 * There used to be two. AppShell kept one in localStorage; BoardDetails kept
 * its own, which started closed on every mount. Clicking a notification takes
 * you from a page under the shell into the board view — a different component
 * mounts, its state starts at false, and the column shuts. The user's choice
 * was not lost there, it was never consulted.
 *
 * A value at module level rather than a context: the two components that read
 * it are never mounted at the same time, so a provider around the whole tree
 * would buy nothing. useSyncExternalStore is what keeps React honest about a
 * value living outside it — every mounted reader re-renders when it changes,
 * which is what stops this from quietly becoming two answers again.
 *
 * Nothing writes here but a click on the chevron. Navigation, a reload, a
 * different board, a notification: none of them may.
 */
import {useSyncExternalStore} from 'react'

const STORAGE_KEY = 'workspaceOpen'

const listeners = new Set()

/** Open unless it was explicitly closed — a first visit should show the boards. */
function read(){
    try {
        return localStorage.getItem(STORAGE_KEY) !== 'false'
    } catch(err) {
        return true
    }
}

let open = read()

function subscribe(listener){
    listeners.add(listener)
    return () => listeners.delete(listener)
}

const getSnapshot = () => open

/** Takes a value or an updater, so it can stand in for a useState setter. */
export function setWorkspaceOpen(next){
    const value = typeof next === 'function'?Boolean(next(open)):Boolean(next)
    if(value === open) return
    open = value
    try {
        localStorage.setItem(STORAGE_KEY, String(open))
    } catch(err) { /* never mind */
    }
    for(const listener of listeners) listener()
}

/** Reads like useState, but there is only ever one of it. */
export function useWorkspaceOpen(){
    return [useSyncExternalStore(subscribe, getSnapshot), setWorkspaceOpen]
}
