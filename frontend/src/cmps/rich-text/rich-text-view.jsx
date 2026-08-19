import {useMemo, useRef} from 'react'

import {toDisplayHtml, isEmpty, hasTaskItems, enableTaskBoxes} from '../../services/rich-text'

/**
 * Stored rich text, on screen.
 *
 * The only place in the application that hands markup to
 * `dangerouslySetInnerHTML`, and it does so through `toDisplayHtml` — which
 * cleans on the way out. Every other component shows text by rendering it as
 * React nodes.
 *
 * Anything that wants to display a comment goes through here rather than
 * calling the sanitizer itself. One door is auditable; six are not.
 *
 * **The checklist is the one exception to "a picture of a state".** With
 * `onToggleTask` given, the boxes can be ticked where they are read, without
 * opening the editor — the way Monday does it. The sanitizer still disables
 * every input it produces; the boxes of a checklist are enabled again
 * afterwards, on the cleaned string, by `enableTaskBoxes`. So the safe
 * default stays the default and switching it off is one named call rather
 * than a flag threaded through the cleaning.
 */
export function RichTextView({value, className = '', onToggleTask = null, ...rest}){
    const isInteractive = Boolean(onToggleTask) && hasTaskItems(value)
    const html = useMemo(
        () => (isInteractive?enableTaskBoxes(toDisplayHtml(value)):toDisplayHtml(value)),
        [value, isInteractive])
    const elRoot = useRef(null)

    if(isEmpty(value)) return null

    /**
     * One handler for the whole block rather than one per box: the boxes come
     * out of dangerouslySetInnerHTML, so React has no elements to hang a
     * listener on.
     *
     * A click on the label text arrives here twice — once for the label and
     * once for the input the browser forwards it to — and only the second is
     * acted on, so both ways of clicking count once.
     */
    function onClick(ev){
        if(!isInteractive) return
        const box = ev.target
        if(!box.matches || !box.matches('input[type="checkbox"]')) return

        // The DOM must not decide what is ticked; the stored text does. Left
        // to itself the box would flip on screen and stay flipped even if the
        // save were refused.
        ev.preventDefault()

        const boxes = [...elRoot.current.querySelectorAll('li[data-type="taskItem"] input[type="checkbox"]')]
        const index = boxes.indexOf(box)
        if(index < 0) return
        onToggleTask(index)
    }

    return (
        <div
            ref={elRoot}
            className={`rich-text${isInteractive?' is-checkable':''}${className?' ' + className:''}`}
            onClick={onClick}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{__html: html}}
            {...rest}
        />
    )
}
