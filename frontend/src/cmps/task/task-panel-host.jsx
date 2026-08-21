import {useEffect, useMemo, useState} from 'react'
import {useSelector} from 'react-redux'
import {useLocation, useNavigate, useSearchParams} from 'react-router-dom'

import {TaskModal} from '../modal/task-modal'
import {loadBoard} from '../../store/board.actions'
import {usePanelWidth} from '../board/use-panel-width'
import {findTaskInBoard, readTaskParams, withoutTaskParams} from '../../services/task-link'
import {t} from '../../i18n'

/**
 * A task, opened on top of whatever page you are on.
 *
 * Sits in the tree once, next to ConfirmHost and UserMsgHost, and does nothing
 * at all until the address carries `?board=&group=&task=`. Everything that
 * links to a task from outside a board — the calendar, the search panel, the
 * notification bell, the running timer — used to navigate to the board to show
 * it. You lost the week you were reading, or the search you had typed, to look
 * at one task, and finding your way back was your problem.
 *
 * Deliberately NOT a nested route. A nested route would have to be added to
 * /calendar, then to the overview, then to the profile, and would be missing
 * from the fourth page somebody puts a task link on. Query parameters work on
 * every page there will ever be without any of them knowing about it.
 *
 * The board's own panel (`board-modal`) keeps the path form of the address,
 * `/board/:boardId/:groupId/:taskId` — that is the shareable link and it
 * predates all of this. When the path already names a task, this one stays out
 * of the way rather than opening a second panel on top of the first.
 */
export function TaskPanelHost(){
    const [searchParams] = useSearchParams()
    const location = useLocation()
    const navigate = useNavigate()
    const board = useSelector(storeState => storeState.boardModule.board)
    const [failed, setFailed] = useState(null)

    const wanted = useMemo(() => readTaskParams(searchParams), [searchParams])
    // The board page shows its own panel from the path. Two panels for one
    // task would be one too many.
    const isOnBoardRoute = /^\/board\/[^/]+\/[^/]+\/[^/]+/.test(location.pathname)
    const isActive = Boolean(wanted) && !isOnBoardRoute

    const {width, isResizing, onGrabStart, onGrabDoubleClick} = usePanelWidth()

    /**
     * The board has to be in the store before the task can be found in it, and
     * writing goes through it as well — `board.actions` compares against the
     * copy it last read from the server to work out what changed.
     *
     * Loaded only when it is a different board from the one already there. On
     * the boards overview or the calendar that is every time; clicking a
     * second task on the same board is free.
     */
    useEffect(() => {
        if(!isActive){
            setFailed(null)
            return
        }
        if(board && String(board._id) === String(wanted.boardId)) return
        let alive = true
        setFailed(null)
        loadBoard(wanted.boardId).catch(() => {
            // The message itself comes from http.service — this only stops the
            // empty panel from sitting there for ever.
            if(alive) setFailed(wanted.taskId)
        })
        return () => { alive = false }
    }, [isActive, wanted && wanted.boardId, board && board._id])

    const isReady = isActive && board && String(board._id) === String(wanted.boardId)
    const found = useMemo(
        () => isReady?findTaskInBoard(board, wanted.groupId, wanted.taskId):null,
        [isReady, board, wanted && wanted.groupId, wanted && wanted.taskId])

    function close(){
        const next = withoutTaskParams(searchParams)
        const search = next.toString()
        navigate({pathname: location.pathname, search: search?`?${search}`:''}, {replace: true})
    }

    /**
     * A link into a task that is not there any more — deleted, or moved to a
     * board this person cannot see. Closed rather than left open on nothing:
     * an empty panel looks like something that is still loading.
     */
    useEffect(() => {
        if(!isActive) return
        if(failed === wanted.taskId){
            close()
            return
        }
        if(isReady && !found) close()
    }, [isActive, isReady, found, failed])

    if(!isActive || !found) return null

    return (
        <>
            <div className={`board-modal-resizer ${isResizing?'is-active':''}`}
                style={{'--panel-width': `${width}px`}} title={t('panel.width')}
                onPointerDown={onGrabStart} onDoubleClick={onGrabDoubleClick}/>
            <section className="board-modal open" style={{'--panel-width': `${width}px`}}>
                <TaskModal key={found.task.id} task={found.task} board={board}
                    groupId={found.groupId} setModalCurrTask={() => {}} onClose={close}/>
            </section>
        </>
    )
}
