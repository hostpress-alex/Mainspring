import {BoardFilter} from '../board/board-filter'
import {closeDynamicModal, updateBoardMeta, toggleModal, toggleStarred} from '../../store/board.actions'
import {loadBoards} from '../../store/board.actions'

import { Icon } from '../icon'
import {useNavigate} from 'react-router-dom'
import {useSelector} from 'react-redux'
import {Tooltip} from '@mui/material'
import {singleLineEditable} from '../../services/editable'
import {RichTextView} from '../rich-text/rich-text-view'
import {boardService} from '../../services/board.service'
import {t} from '../../i18n'

export function BoardHeader({
    board,
    onSetFilter,
    isStarredOpen,
    setIsShowDescription,
    setIsInviteModalOpen,
    setBoardType,
    boardType
}){
    const isOpen = useSelector(storeState => storeState.boardModule.isBoardModalOpen)
    const navigate = useNavigate()

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

    function onSetBoardType(type){
        setBoardType(type)
        closeDynamicModal()
    }

    const me = useSelector(storeState => storeState.userModule.user)
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
            <div className="board-display-btns flex">
                <Tooltip title={t('board.table')} arrow>
                    <div className={`type-btn ${boardType === 'table'?' active':''}`} onClick={() => onSetBoardType('table')}>
                        <Icon name='house' className="icon"/>
                        <span className="wide" onClick={() => onSetBoardType('table')}>{t('board.table')}</span>
                        <span className="mobile">{t('board.table')}</span>
                    </div>
                </Tooltip>
                <Tooltip title={t('board.kanban')} arrow>
                    <div className={`type-btn ${boardType === 'kanban'?' active':''}`} onClick={() => onSetBoardType('kanban')}>
                        <Icon name='table-columns'/>
                        <span className="wide">{t('board.kanban')}</span>
                        <span className="mobile" onClick={() => onSetBoardType('kanban')}>{t('board.kanban')}</span>
                    </div>
                </Tooltip>
                <Tooltip title={t('board.dashboard')} arrow>
                    <div className={`type-btn ${boardType === 'dashboard'?' active':''}`} onClick={() => onSetBoardType('dashboard')}>
                        <Icon name='chart-column'/>
                        <span className="wide">{t('board.dashboard')}</span>
                        <span className="mobile" onClick={() => onSetBoardType('dashboard')}>{t('board.dashboard')}</span>
                    </div>
                </Tooltip>
            </div>
            <div className="board-border"></div>
            {boardType !== 'dashboard' &&
                <BoardFilter onSetFilter={onSetFilter} board={board} setIsInviteModalOpen={setIsInviteModalOpen}/>}
        </header>
    )
}
