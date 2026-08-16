import {useParams, useSearchParams} from 'react-router-dom'
import {useEffect, useState} from 'react'
import {useSelector} from 'react-redux'

import {socketService, SOCKET_EMIT_SET_TOPIC, SOCKET_EVENT_ADD_UPDATE_BOARD} from '../services/socket.service'
import {loadBoard, loadBoards, loadSocketBoard, setFilter} from '../store/board.actions'
import {ModalMemberInvite} from '../cmps/modal/modal-member-invite'
import {WorkspaceSidebar} from '../cmps/sidebar/workspace-sidebar'
import {LoginLogoutModal} from '../cmps/modal/login-logout-modal'
import {GroupListKanban} from '../cmps/kanban/group-list-kanban'
import {BoardDescription} from '../cmps/board/board-description'
import {MainSidebar} from '../cmps/sidebar/main-sidebar'
import {DynamicModal} from '../cmps/modal/dynamic-modal'
import {boardService} from '../services/board.service'
import {CreateBoard} from '../cmps/modal/create-board'
import {BoardHeader} from '../cmps/board/board-header'
import {BoardModal} from '../cmps/board/board-modal'
import {GroupList} from '../cmps/board/group-list'
import {loadUsers} from '../store/user.actions'
import {Loader} from '../cmps/loader'
import {Dashboard} from './dashboard'

export function BoardDetails(){
    const board = useSelector(storeState => storeState.boardModule.filteredBoard)
    const boards = useSelector(storeState => storeState.boardModule.boards)
    const isBoardModalOpen = useSelector(storeState => storeState.boardModule.isBoardModalOpen)

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [isShowDescription, setIsShowDescription] = useState(false)
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
    const [isStarredOpen, setIsStarredOpen] = useState(false)
    const [boardType, setBoardType] = useState('table')

    const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false)
    const [workspaceDisplay, setWorkspaceDisplay] = useState('board')

    const {boardId} = useParams()
    const [searchParams, setSearchParams] = useSearchParams()
    const queryFilterBy = boardService.getFilterFromSearchParams(searchParams)

    // Once per visit to this page, whichever board it is.
    useEffect(() => {
        loadUsers()
        if(!boards.length) loadBoards()
    }, [])

    /**
     * The board itself, every time the id in the URL changes.
     *
     * This used to run on mount only. All three /board/... routes render the
     * same element, so React keeps one BoardDetails alive across them and a
     * mount-only effect never fires again — going from one board to another,
     * or to a task in another board, changed the URL and the sidebar while the
     * old board stayed on screen. It was invisible as long as the only way to
     * switch was the board list, which reloads on click.
     *
     * queryFilterBy is left out of the dependencies on purpose: it is rebuilt
     * from the search params on every render, so a new object each time, and
     * naming it here would reload the board in a loop. The filter has its own
     * path in through onSetFilter.
     */
    useEffect(() => {
        loadBoard(boardId, queryFilterBy)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [boardId])

    useEffect(() => {
        socketService.emit(SOCKET_EMIT_SET_TOPIC, boardId)
        socketService.on(SOCKET_EVENT_ADD_UPDATE_BOARD, loadSocketBoard)

        return () => {
            socketService.off(SOCKET_EVENT_ADD_UPDATE_BOARD, loadSocketBoard)
        }
    }, [])

    useEffect(() => {
        socketService.off(SOCKET_EVENT_ADD_UPDATE_BOARD, loadSocketBoard)
        socketService.emit(SOCKET_EMIT_SET_TOPIC, boardId)
        socketService.on(SOCKET_EVENT_ADD_UPDATE_BOARD, loadSocketBoard)
    }, [boardId, isBoardModalOpen])

    function closeOverlays(){
        setIsInviteModalOpen(false)
        setIsCreateModalOpen(false)
    }

    function onSetFilter(filterBy){
        setSearchParams(filterBy)
        loadBoard(boardId, filterBy)
        setFilter(filterBy)
    }

    if(!board) return <Loader/>
    return (
        <section className="board-details flex">
            <div className="sidebar flex">
                <MainSidebar setWorkspaceDisplay={setWorkspaceDisplay} setIsWorkspaceOpen={setIsWorkspaceOpen} setIsLoginModalOpen={setIsLoginModalOpen}/>
                <WorkspaceSidebar workspaceDisplay={workspaceDisplay} isWorkspaceOpen={isWorkspaceOpen} setIsWorkspaceOpen={setIsWorkspaceOpen} board={board} setIsCreateModalOpen={setIsCreateModalOpen}/>
            </div>
            <main className="board-main">
                <BoardHeader boardType={boardType} setBoardType={setBoardType} board={board} onSetFilter={onSetFilter} isStarredOpen={isStarredOpen} setIsShowDescription={setIsShowDescription} setIsInviteModalOpen={setIsInviteModalOpen}/>
                {boardType === 'table' && <GroupList board={board}/>}

                {boardType === 'kanban' &&
                    <GroupListKanban board={board}/>
                }
                <BoardModal/>
                {boardType === 'dashboard' && <Dashboard/>}
            </main>
            {isCreateModalOpen && <CreateBoard setIsModalOpen={setIsCreateModalOpen}/>}
            {/* Deliberately without the task dialog: the board stays usable and
                scrollable while a task is open on the right.
                Clicking the dimming closes what it belongs to. Everywhere else
                in the app a click beside a dialog closes it, and a backdrop
                that only swallows clicks looks like the page has hung. */}
            {(isInviteModalOpen || isCreateModalOpen) &&
                <div className="dark-screen" onClick={closeOverlays}></div>}
            {isShowDescription &&
                <>
                    <BoardDescription setIsShowDescription={setIsShowDescription} board={board}/>
                    <div className="dark-screen" onClick={() => setIsShowDescription(false)}></div>
                </>
            }
            {isLoginModalOpen && <LoginLogoutModal setIsLoginModalOpen={setIsLoginModalOpen}/>}
            {isInviteModalOpen && <ModalMemberInvite board={board} setIsInviteModalOpen={setIsInviteModalOpen}/>}
            <DynamicModal/>
        </section>
    )
}
