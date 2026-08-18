import {BoardFilter} from '../board/board-filter'
import {updateBoardMeta, toggleModal, toggleStarred} from '../../store/board.actions'
import {loadBoards} from '../../store/board.actions'

import { Icon } from '../icon'
import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useSelector} from 'react-redux'
import {Tooltip} from '@mui/material'
import {singleLineEditable} from '../../services/editable'
import {RichTextView} from '../rich-text/rich-text-view'
import {AutomationPanel} from '../automation/automation-panel'
import {BinPanel} from '../bin/bin-panel'
import {boardService} from '../../services/board.service'
import {BoardViews} from '../view/board-views'
import {t} from '../../i18n'

export function BoardHeader({
    board,
    onSetFilter,
    isStarredOpen,
    setIsShowDescription,
    setIsInviteModalOpen,
    tabs,
    activeTab,
    viewErr,
    onActivateTab,
    onCreateView,
    onUpdateView,
    onRemoveView
}){
    const isOpen = useSelector(storeState => storeState.boardModule.isBoardModalOpen)
    const navigate = useNavigate()
    const [isAutomationOpen, setIsAutomationOpen] = useState(false)
    const [isBinOpen, setIsBinOpen] = useState(false)

    async function onSave(ev){
        const value = ev.target.innerText
        if(!value || value === board.title) return
        board.title = value
        try {
            await updateBoardMeta(board._id, {title: value})
            loadBoards()
        } catch(err) {
            console.log('saving failed')
        }
    }

    function onToggleStarred(){
        try {
            toggleStarred(board, isStarredOpen)
        } catch(err) {
            console.log(err)
        }
    }

    const me = useSelector(storeState => storeState.userModule.user)
    const filter = useSelector(storeState => storeState.boardModule.filter)
    const boardType = activeTab?.display || 'table'
    // The board's own name and description are the frame — owner only.
    const canManage = boardService.canManageBoard(board, me)

    if(!board.members) return <div></div>
    return (
        <header className="board-header">
            <section className="board-title flex align-center space-around">
                <div className="board-info flex">
                    {/* Editable only for whoever may actually save it. A
                        contentEditable that quietly loses the change on blur is
                        worse than a heading that is plainly not editable. */}
                    {canManage?(
                        <Tooltip title={t('board.clickToEdit')} arrow>
                            <blockquote contentEditable onBlur={onSave} suppressContentEditableWarning={true}
                                        {...singleLineEditable()}>
                                <h1>{board.title}</h1>
                            </blockquote>
                        </Tooltip>
                    ):(
                        <blockquote><h1>{board.title}</h1></blockquote>
                    )}
                    <Tooltip title={t('board.showDescription')} arrow>
                        <div className="info-btn icon" onClick={() => setIsShowDescription(true)}>
                            <Icon name='circle-exclamation'/>
                        </div>
                    </Tooltip>
                    {/* Open to everyone who can see the board: knowing what
                        left it is reading. Putting something back is checked
                        per row on the server. */}
                    <Tooltip title={t('bin.open')} arrow>
                        <div className="bin-btn icon" onClick={() => setIsBinOpen(true)}>
                            <Icon name='trash-can' variant='fa-regular'/>
                        </div>
                    </Tooltip>
                    {/* Rules change what the board does on its own, which is
                        board structure — the same door as columns and groups.
                        Hiding the button is not the permission; the server
                        refuses every one of these calls to anybody else. */}
                    {canManage && (
                        <Tooltip title={t('automation.open')} arrow>
                            <div className="automation-btn icon" onClick={() => setIsAutomationOpen(true)}>
                                <Icon name='robot'/>
                            </div>
                        </Tooltip>
                    )}
                    <Tooltip title={t('board.addFavorite')} arrow>
                        <div className="star-btn icon " onClick={onToggleStarred}>
                            {!board.isStarred?<Icon name='star' variant='fa-regular' className="star"/>:<Icon name='star' className="star star-full"/>}
                        </div>
                    </Tooltip>
                </div>
            </section>
            <div className="board-description flex">
                {board.description && (
                    <div className="board-description-link">
                        {/* Rendered, not printed. It used to be dropped into a
                            <p> as a string, which was fine while it WAS a
                            string and shows the tags now that it is markup. */}
                        <RichTextView value={board.description}/>
                        <span onClick={() => setIsShowDescription(true)}>{t('board.more')}</span>
                    </div>
                )}
            </div>
            {/* Table, kanban and dashboard used to be three buttons here and a
                saved filter was a chip inside the filter panel — two strips of
                the same idea. One strip now: see cmps/view/board-views.jsx. */}
            <BoardViews board={board} me={me} tabs={tabs} activeId={activeTab?.id}
                filter={filter} err={viewErr}
                onActivate={onActivateTab} onCreate={onCreateView}
                onUpdate={onUpdateView} onRemove={onRemoveView}/>
            <div className="board-border"></div>
            {boardType !== 'dashboard' &&
                <BoardFilter onSetFilter={onSetFilter} board={board} setIsInviteModalOpen={setIsInviteModalOpen}
                    activeTab={activeTab} onUpdateView={onUpdateView}/>}
            {isAutomationOpen && <AutomationPanel board={board} onClose={() => setIsAutomationOpen(false)}/>}
            {isBinOpen && <BinPanel board={board} onClose={() => setIsBinOpen(false)}/>}
        </header>
    )
}
