import {useParams, useSearchParams} from 'react-router-dom'
import {useEffect, useMemo, useState} from 'react'
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
import {useWorkspaceOpen} from '../customHooks/useWorkspaceOpen'
import {boardService} from '../services/board.service'
import {DISPLAYS, findTab, forgetTab, loadActiveTab, saveActiveTab, tabsOf} from '../services/board-view'
import {MODE_ALL} from '../services/board-filter'
import {CreateBoard} from '../cmps/modal/create-board'
import {BoardHeader} from '../cmps/board/board-header'
import {BoardModal} from '../cmps/board/board-modal'
import {GroupList} from '../cmps/board/group-list'
import {loadUsers} from '../store/user.actions'
import {Loader} from '../cmps/loader'
import {t} from '../i18n'
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

    // Read before any state that needs it. This used to sit below the tab
    // state, whose lazy initialiser reads boardId — and a `const` read before
    // its own line is a ReferenceError, not undefined, so the whole page went
    // white the moment a board was opened.
    const {boardId} = useParams()
    const [searchParams, setSearchParams] = useSearchParams()
    const queryFilterBy = boardService.getFilterFromSearchParams(searchParams)

    // The tabs. `views` are the saved ones; the three built-in ones are added
    // by tabsOf. Which one is open decides BOTH the filter and the drawing —
    // boardType is no longer a state of its own, because two states saying
    // what you are looking at is one too many.
    const [views, setViews] = useState([])
    const [activeViewId, setActiveViewId] = useState(() => loadActiveTab(boardId))
    const [viewErr, setViewErr] = useState(null)

    // Not local state: the column stays as the user left it, whichever page
    // they came from. See customHooks/useWorkspaceOpen.
    const [isWorkspaceOpen, setIsWorkspaceOpen] = useWorkspaceOpen()
    const [workspaceDisplay, setWorkspaceDisplay] = useState('board')

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
     *
     * The board is opened with the filter it was last left with. A filter you
     * set and then lose on the next visit is worse than none: the board looks
     * complete and is not, and there is nothing on screen saying so. A link
     * carrying a search or a person in it wins over the stored one — somebody
     * sent that link on purpose.
     */
    useEffect(() => {
        let alive = true
        const tabId = loadActiveTab(boardId)
        setActiveViewId(tabId)
        setViewErr(null)

        // A built-in tab needs nothing from the server, so the board is loaded
        // straight away. Only a saved tab has to wait for its own rules —
        // loading the board first and correcting it afterwards would show the
        // unfiltered board for a moment, which reads as the filter having been
        // lost.
        if(DISPLAYS.includes(tabId)) applyTab({id: tabId, builtin: true}, {fromUrl: true})

        boardService.getViews(boardId)
            .then(list => {
                if(!alive) return
                setViews(Array.isArray(list)?list:[])
                const tab = findTab(tabsOf(list), tabId)
                if(String(tab.id) === String(tabId)){
                    if(!tab.builtin) applyTab(tab, {fromUrl: true})
                    return
                }
                // The stored tab is gone: deleted, or shared and then taken
                // back. Fall back to the table rather than to nothing.
                forgetTab(boardId, tabId)
                setActiveViewId(tab.id)
                applyTab(tab, {fromUrl: true})
            })
            .catch(err => alive && setViewErr(readErr(err)))

        return () => {
            alive = false
        }
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

    /**
     * Only the two quick filters go into the URL — see
     * boardService.getFilterFromSearchParams for why the rules do not.
     *
     * A built-in tab keeps its filter in the browser. A saved tab does not:
     * its rules live on the server, and a local copy would silently win over
     * them. Editing a saved tab goes through "Ansicht aktualisieren".
     */
    function onSetFilter(filterBy){
        writeUrl(filterBy)
        if(activeTab.builtin) boardService.saveFilter(boardId, activeTab.id, filterBy)
        loadBoard(boardId, filterBy)
        setFilter(filterBy)
    }

    /**
     * The two quick filters in the address bar — and only when they hold
     * something.
     *
     * It used to write them unconditionally, so every board sat under
     * `?title=&memberId=` forever: two parameters that say nothing, on a URL
     * people copy and paste. Empty means absent.
     *
     * `replace`, because a filter is not a place. Pushing would mean the back
     * button walks backwards through every search you have typed instead of
     * leaving the board.
     */
    function writeUrl(filterBy){
        const next = {}
        if(filterBy.title) next.title = filterBy.title
        if(filterBy.memberId) next.memberId = filterBy.memberId
        setSearchParams(next, {replace: true})
    }

    /** Open a tab: its rules, its drawing, and the board reloaded once. */
    function applyTab(tab, {fromUrl = false} = {}){
        const filterBy = tab.builtin
            ?boardService.loadFilter(boardId, tab.id)
            :{...boardService.getDefaultFilterBoard(), rules: tab.rules || [], mode: tab.mode || MODE_ALL}

        // A link that carries a search wins on arrival, and only on arrival —
        // clicking a tab afterwards is a fresh decision.
        if(fromUrl){
            if(queryFilterBy.title) filterBy.title = queryFilterBy.title
            if(queryFilterBy.memberId) filterBy.memberId = queryFilterBy.memberId
        }
        writeUrl(filterBy)
        setFilter(filterBy)
        loadBoard(boardId, filterBy)
    }

    function onActivateTab(tab){
        setViewErr(null)
        setActiveViewId(tab.id)
        saveActiveTab(boardId, tab.id)
        applyTab(tab)
    }

    async function onCreateView(draft){
        setViewErr(null)
        try {
            const view = await boardService.addView(boardId, draft)
            setViews(prev => [...prev, view])
            setActiveViewId(view.id)
            saveActiveTab(boardId, view.id)
            applyTab({...view, builtin: false})
        } catch(err) {
            setViewErr(readErr(err))
        }
    }

    async function onUpdateView(tab, patch){
        setViewErr(null)
        try {
            const view = await boardService.updateView(boardId, tab.id, patch)
            setViews(prev => prev.map(v => (String(v.id) === String(view.id)?view:v)))
            if(String(activeViewId) === String(view.id)) applyTab({...view, builtin: false})
        } catch(err) {
            setViewErr(readErr(err))
        }
    }

    async function onRemoveView(tab){
        setViewErr(null)
        try {
            await boardService.removeView(boardId, tab.id)
            setViews(prev => prev.filter(v => String(v.id) !== String(tab.id)))
            if(String(activeViewId) === String(tab.id)){
                forgetTab(boardId, tab.id)
                onActivateTab({id: 'table', display: 'table', builtin: true})
            }
        } catch(err) {
            setViewErr(readErr(err))
        }
    }

    const tabs = useMemo(() => tabsOf(views), [views])
    const activeTab = findTab(tabs, activeViewId)
    const boardType = activeTab.display

    if(!board) return <Loader/>
    return (
        <section className="board-details flex">
            <div className="sidebar flex">
                <MainSidebar setWorkspaceDisplay={setWorkspaceDisplay} setIsWorkspaceOpen={setIsWorkspaceOpen} setIsLoginModalOpen={setIsLoginModalOpen}/>
                <WorkspaceSidebar workspaceDisplay={workspaceDisplay} isWorkspaceOpen={isWorkspaceOpen} setIsWorkspaceOpen={setIsWorkspaceOpen} board={board} setIsCreateModalOpen={setIsCreateModalOpen}/>
            </div>
            <main className="board-main">
                <BoardHeader board={board} onSetFilter={onSetFilter} isStarredOpen={isStarredOpen}
                    setIsShowDescription={setIsShowDescription} setIsInviteModalOpen={setIsInviteModalOpen}
                    tabs={tabs} activeTab={activeTab} viewErr={viewErr}
                    onActivateTab={onActivateTab} onCreateView={onCreateView}
                    onUpdateView={onUpdateView} onRemoveView={onRemoveView}/>
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

const readErr = e => e?.response?.data?.err || e?.message || t('common.unknownError')
