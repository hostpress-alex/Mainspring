import {useCallback, useEffect, useRef, useState} from 'react'
import {loadPanelWidth, savePanelWidth, clampPanelWidth} from './panel-width'

/**
 * The draggable width of the right-hand panel.
 *
 * Lifted out of board-modal when a second panel started using it. Not because
 * duplication is untidy — because the two would have drifted: the panel sits
 * on the right, so dragging LEFT makes it wider, and the day somebody fixes
 * that sign in one copy and not the other, the same handle behaves differently
 * depending on which page opened the task.
 */
export function usePanelWidth(){
    const [width, setWidth] = useState(loadPanelWidth)
    const [isResizing, setIsResizing] = useState(false)
    const startRef = useRef({x: 0, width: 0})

    // If the browser window gets smaller, the panel must not stick out beyond it.
    useEffect(() => {
        function onWindowResize(){
            setWidth(w => clampPanelWidth(w))
        }

        window.addEventListener('resize', onWindowResize)
        return () => window.removeEventListener('resize', onWindowResize)
    }, [])

    const onGrabStart = useCallback(ev => {
        ev.preventDefault()
        startRef.current = {x: ev.clientX, width}
        setIsResizing(true)
    }, [width])

    useEffect(() => {
        if(!isResizing) return

        // The panel sits on the right: dragging left makes it wider.
        function onMove(ev){
            setWidth(clampPanelWidth(startRef.current.width + (startRef.current.x - ev.clientX)))
        }

        function onUp(){
            setIsResizing(false)
            setWidth(w => {
                savePanelWidth(w)
                return w
            })
        }

        // While dragging, select nothing and do not let the cursor change.
        const prevSelect = document.body.style.userSelect
        const prevCursor = document.body.style.cursor
        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'col-resize'

        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        return () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
            document.body.style.userSelect = prevSelect
            document.body.style.cursor = prevCursor
        }
    }, [isResizing])

    /** Double-click on the handle: back to the base width. */
    const onGrabDoubleClick = useCallback(() => {
        const next = clampPanelWidth(640)
        setWidth(next)
        savePanelWidth(next)
    }, [])

    return {width, isResizing, onGrabStart, onGrabDoubleClick}
}
