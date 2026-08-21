import {useEffect, useMemo} from 'react'
import {useSelector} from 'react-redux'
import {useParams} from 'react-router-dom'

import {TaskModal} from '../modal/task-modal'
import {BoardActivityModal} from './board-activity-modal'
import {setModalOpen} from '../../store/board.actions'
import {usePanelWidth} from './use-panel-width'
import {findTaskInBoard} from '../../services/task-link'
import {t} from '../../i18n'

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
 * This one is the board's own panel and handles the path form of the address,
 * `/board/:boardId/:groupId/:taskId`, plus the board activity log which only
 * exists here. The same task panel opened from anywhere ELSE — the calendar,
 * the search, the bell, the timer — is `task-panel-host`, which hangs off the
 * query string instead. Both render the same `TaskModal` at the same width;
 * see `services/task-link` for why there are two forms and not one.
 */
export function BoardModal(){
    const {groupId, taskId, activityLog} = useParams()
    const board = useSelector((storeState) => storeState.boardModule.board)

    const isOpen = Boolean((groupId && taskId) || activityLog)
    const {width, isResizing, onGrabStart, onGrabDoubleClick} = usePanelWidth()

    const found = useMemo(
        () => (board && taskId)?findTaskInBoard(board, groupId, taskId):null,
        [board, groupId, taskId])

    const currTask = found?.task || null

    useEffect(() => {
        setModalOpen(isOpen)
    }, [isOpen])

    if(!currTask && !activityLog) return <div></div>

    return (
        <>
            {isOpen && (
                <div className={`board-modal-resizer ${isResizing?'is-active':''}`} style={{'--panel-width': `${width}px`}} title={t('panel.width')} onPointerDown={onGrabStart} onDoubleClick={onGrabDoubleClick}/>
            )}
            <section className={`board-modal ${isOpen?'open':''}`} style={{'--panel-width': `${width}px`}}>
                {!activityLog && (
                    <TaskModal key={currTask.id} task={currTask} board={board} groupId={found.groupId} setModalCurrTask={() => {
                    }}/>
                )}
                {activityLog && (
                    <section className="board-activity-modal">
                        <BoardActivityModal board={board} activityLog={activityLog}/>
                    </section>
                )}
            </section>
        </>
    )
}
