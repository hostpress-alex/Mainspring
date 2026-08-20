/**
 * Telling somebody that it did not work.
 *
 * Until this file existed there was no way to do that. A failed write was
 * caught, printed to the console and forgotten — 61 of the 168 catch blocks in
 * this frontend end in `console.log`, and a console nobody has open is the
 * same as no handling at all. What that costs was measured on a real bug: a
 * deadline could be picked, the cell showed it, the save threw before the
 * request was even built, and the value was gone after a reload. It took a
 * network log to find something the person in front of the screen had been
 * looking at all along.
 *
 * A service rather than a component, because the place that knows a write
 * failed is `http.service.js`, and a service may not import from `cmps/`.
 * The component subscribes here; this file knows nothing about React.
 *
 * Messages raised before the host is in the tree are kept, not dropped. A
 * failure during start-up is exactly the one worth seeing.
 */

/** How many un-shown messages are kept. A burst is a burst; the first few
 *  say what happened and the rest say it again. */
const PENDING_LIMIT = 5

let listener = null
let pending = []
let nextId = 1

function emit(msg){
    if(listener){
        listener(msg)
        return
    }
    pending.push(msg)
    if(pending.length > PENDING_LIMIT) pending.shift()
}

/**
 * The host registers itself here. Returns the unsubscribe.
 *
 * Exactly one listener, like the confirmation dialog: two message stacks in
 * one tree is a bug, not a feature, and this way it cannot happen by mistake.
 */
export function subscribeMsgs(fn){
    listener = fn
    const queued = pending
    pending = []
    for(const msg of queued) fn(msg)
    return () => {
        if(listener === fn) listener = null
    }
}

/** Something did not work, and the person needs to know. */
export function showErrorMsg(txt){
    if(!txt) return
    emit({id: nextId++, type: 'error', txt: String(txt)})
}

/**
 * Something worked and it is not obvious on screen.
 *
 * Use sparingly. A message for every save turns into noise, and noise is what
 * people learn to click away without reading — which would put us back where
 * we started.
 */
export function showSuccessMsg(txt){
    if(!txt) return
    emit({id: nextId++, type: 'success', txt: String(txt)})
}

/** Test seam. Nothing in the application calls this. */
export function _resetMsgs(){
    listener = null
    pending = []
    nextId = 1
}
