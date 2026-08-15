/**
 * Verhalten fuer einzeilige contentEditable-Felder (Task-Titel, Gruppenname,
 * Boardname).
 *
 * Ohne das hier macht Enter in so einem Feld eine neue Zeile — gespeichert
 * wird erst beim Klick irgendwohin. Das ist bei einem Titel nie gemeint.
 *
 *   Enter          speichern (loest das vorhandene onBlur aus)
 *   Shift+Enter    trotzdem eine neue Zeile, falls jemand sie braucht
 *   Escape         verwerfen und den urspruenglichen Text zuruecksetzen
 *
 * Verwendung:
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
