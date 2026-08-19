/**
 * Behaviour for single-line contentEditable fields (task title, group name,
 * board name).
 *
 * Without this, Enter in such a field starts a new line — and nothing is saved
 * until you click somewhere else. For a title that is never what was meant.
 *
 *   Enter          save (triggers the onBlur that is already there)
 *   Shift+Enter    a new line anyway, in case someone needs one
 *   Escape         discard and put the original text back
 *
 * Usage:
 *   <blockquote contentEditable onBlur={onSave} {...singleLineEditable()} />
 *   <blockquote contentEditable onBlur={onSave} {...singleLineEditable({ onFocus: … })} />
 */
export function singleLineEditable({onFocus} = {}){
    return {
        onFocus: ev => {
            // Fuer Escape merken, was vorher drinstand.
            ev.currentTarget.dataset.origText = ev.currentTarget.innerText
            if(onFocus) onFocus(ev)
        },
        onKeyDown: ev => {
            if(ev.key === 'Enter' && !ev.shiftKey){
                ev.preventDefault()
                ev.currentTarget.blur()
                return
            }
            if(ev.key === 'Escape'){
                ev.preventDefault()
                const orig = ev.currentTarget.dataset.origText
                if(orig !== undefined) ev.currentTarget.innerText = orig
                ev.currentTarget.blur()
            }
        }
    }
}

/**
 * Is `clientX` over the written text of `el`, or over the empty space next to
 * it?
 *
 * A one-line title field is almost always wider than the title in it. The box
 * therefore has two halves that look identical and mean different things: the
 * words, where a click puts the caret, and the rest of the cell, where a click
 * should do whatever the cell does — open the task, in the case of the board.
 * Measuring is the only honest way to tell them apart: the element does not
 * know where its text ends, but a range over its contents does.
 *
 * Deliberately not "was the inner <span> hit". Typing into a contentEditable
 * field takes that span apart, and the check would then be wrong for the rest
 * of the editing session.
 *
 * An empty field is all text as far as this is concerned — otherwise a title
 * that was cleared could never be written again.
 */
export function isOnText(el, clientX, pad = 4){
    if(!el) return false
    const range = document.createRange()
    range.selectNodeContents(el)
    const rects = [...range.getClientRects()]
    if(!rects.length) return true
    const left = Math.min(...rects.map(r => r.left))
    const right = Math.max(...rects.map(r => r.right))
    return clientX >= left - pad && clientX <= right + pad
}
