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
export function singleLineEditable ({ onFocus } = {}) {
    return {
        onFocus: ev => {
            // Fuer Escape merken, was vorher drinstand.
            ev.currentTarget.dataset.origText = ev.currentTarget.innerText
            if (onFocus) onFocus(ev)
        },
        onKeyDown: ev => {
            if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault()
                ev.currentTarget.blur()
                return
            }
            if (ev.key === 'Escape') {
                ev.preventDefault()
                const orig = ev.currentTarget.dataset.origText
                if (orig !== undefined) ev.currentTarget.innerText = orig
                ev.currentTarget.blur()
            }
        },
    }
}
