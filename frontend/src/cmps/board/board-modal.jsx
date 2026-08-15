import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSelector } from "react-redux"
import { useParams } from "react-router-dom"

import { TaskModal } from "../modal/task-modal"
import { BoardActivityModal } from "./board-activity-modal"
import { setModalOpen } from "../../store/board.actions"
import { loadPanelWidth, savePanelWidth, clampPanelWidth } from "./panel-width"
import { t } from '../../i18n'

/**
 * The right-hand dialog hangs off the URL alone.
 *
 * Before: a separate flag in the store was toggled by every opener through
 * `toggleModal(currentState)`, and the task was loaded in an effect with
 * `[isOpen]` as its only dependency. Because of that
 *  - the first click did nothing (the flag flipped before the route was there),
 *  - and switching to another task loaded nothing, because the flag did not
 *    change in the process — you kept seeing the previous task.
 *
 * Now everything is derived from the route parameters; the store flag is only
 * kept in step because the background dimming and the socket effect read it.
 *
 * The width can be dragged at the left edge and is remembered per browser.
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

    // If the browser window gets smaller, the panel must not stick out beyond it.
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
        // The panel sits on the right: dragging left makes it wider.
        function onMove(ev) {
            setWidth(clampPanelWidth(startRef.current.width + (startRef.current.x - ev.clientX)))
        }
        function onUp() {
            setIsResizing(false)
            setWidth(w => { savePanelWidth(w); return w })
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
                    style={{ '--panel-width': `${width}px` }}
                    title={t('panel.width')}
                    onPointerDown={onGrabStart}
                    onDoubleClick={onGrabDoubleClick} />
            )}
            <section className={`board-modal ${isOpen ? 'open' : ''}`}
                style={{ '--panel-width': `${width}px` }}>
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
