/**
 * Close a small popup when the click goes somewhere else.
 *
 * Every menu in the application owes the reader the same two exits — a click
 * beside it and Escape — and a menu that only closes through the button that
 * opened it reads as stuck. This is that pair, once, instead of the same
 * fifteen lines copied into each menu.
 *
 * Attach the returned ref to the element that counts as "inside". Put it
 * around the trigger as well as the popup: otherwise the click on the trigger
 * closes the menu here and the trigger's own onClick opens it again, and the
 * button stops working.
 *
 * `mousedown` rather than `click`, because a click that starts inside the
 * popup and ends outside it (a text selection dragged past the edge) is not
 * somebody asking for the menu to go away.
 */
import {useEffect, useRef} from 'react'

export function useDismissable(isOpen, onDismiss){
    const ref = useRef(null)
    const dismissRef = useRef(onDismiss)
    dismissRef.current = onDismiss

    useEffect(() => {
        if(!isOpen) return

        function onPointerDown(ev){
            if(ref.current && ref.current.contains(ev.target)) return
            dismissRef.current()
        }

        function onKey(ev){
            if(ev.key === 'Escape') dismissRef.current()
        }

        document.addEventListener('mousedown', onPointerDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onPointerDown)
            document.removeEventListener('keydown', onKey)
        }
        // Deliberately not onDismiss: it is read through a ref, so a caller
        // that passes a fresh arrow function on every render does not make
        // this subscribe and unsubscribe on every render.
    }, [isOpen])

    return ref
}
