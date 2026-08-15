import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSelector } from "react-redux"
import { useParams } from "react-router-dom"

import { TaskModal } from "../modal/task-modal"
import { BoardActivityModal } from "./board-activity-modal"
import { setModalOpen } from "../../store/board.actions"
import { loadPanelWidth, savePanelWidth, clampPanelWidth, MIN_PANEL_WIDTH } from "./panel-width"

/**
 * Der rechte Dialog haengt allein an der URL.
 *
 * Vorher: ein separates Flag im Store wurde von jedem Oeffner per
 * `toggleModal(aktuellerZustand)` umgeschaltet, und der Task wurde in einem
 * Effekt mit `[isOpen]` als einziger Abhaengigkeit geladen. Dadurch
 *  - blieb der erste Klick wirkungslos (das Flag kippte, bevor die Route stand),
 *  - und ein Wechsel auf einen anderen Task lud nichts nach, weil sich das Flag
 *    dabei nicht aenderte — man sah weiter den vorherigen Task.
 *
 * Jetzt wird alles aus den Route-Parametern abgeleitet; das Store-Flag wird nur
 * noch nachgezogen, weil Hintergrund-Abdunklung und Socket-Effekt es lesen.
 *
 * Die Breite laesst sich am linken Rand ziehen und bleibt pro Browser gemerkt.
 */
export function BoardModal() {
    const { groupId, taskId, activityLog } = useParams()
    const board = useSelector((storeState) => storeState.boardModule.board)

    const isOpen = Boolean((groupId && taskId) || activityLog)

    const [width, setWidth] = useState(loadPanelWidth)
    const [isResizing, setIsResizing] = useState(false)
    const startRef = useRef({ x: 0, width: 0 })

    const currTask = useMemo(() => {
        if (!board || !groupId || !taskId) return null
        const group = (board.groups || []).find(group => group.id === groupId)
        return (group?.tasks || []).find(task => task.id === taskId) || null
    }, [board, groupId, taskId])

    useEffect(() => { setModalOpen(isOpen) }, [isOpen])

    // Wird das Browserfenster kleiner, darf das Panel nicht darueber hinausragen.
    useEffect(() => {
        function onWindowResize() { setWidth(w => clampPanelWidth(w)) }
        window.addEventListener('resize', onWindowResize)
        return () => window.removeEventListener('resize', onWindowResize)
    }, [])

    const onGrabStart = useCallback(ev => {
        ev.preventDefault()
        startRef.current = { x: ev.clientX, width }
        setIsResizing(true)
    }, [width])

    useEffect(() => {
        if (!isResizing) return
        // Das Panel sitzt rechts: nach links ziehen macht es breiter.
        function onMove(ev) {
            setWidth(clampPanelWidth(startRef.current.width + (startRef.current.x - ev.clientX)))
        }
        function onUp() {
            setIsResizing(false)
            setWidth(w => { savePanelWidth(w); return w })
        }
        // Waehrend des Ziehens nichts markieren und den Zeiger nicht wechseln lassen.
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

    /** Doppelklick auf den Griff: zurueck auf die Grundbreite. */
    function onGrabDoubleClick() {
        const next = clampPanelWidth(640)
        setWidth(next)
        savePanelWidth(next)
    }

    if (!currTask && !activityLog) return <div></div>

    return (
        <>
            {isOpen && (
                <div className={`board-modal-resizer ${isResizing ? 'is-active' : ''}`}
                    style={{ right: width }}
                    title="Breite ziehen — Doppelklick setzt zurück"
                    onPointerDown={onGrabStart}
                    onDoubleClick={onGrabDoubleClick} />
            )}
            <section className={`board-modal ${isOpen ? 'open' : ''}`}
                style={{ width, minWidth: MIN_PANEL_WIDTH }}>
                {!activityLog && (
                    <TaskModal key={currTask.id} task={currTask} board={board}
                        groupId={groupId} setModalCurrTask={() => {}} />
                )}
                {activityLog && (
                    <section className="board-activity-modal">
                        <BoardActivityModal board={board} activityLog={activityLog} />
                    </section>
                )}
            </section>
        </>
    )
}
