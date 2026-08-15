import { BoardFilter } from '../board/board-filter'
import { closeDynamicModal, updateBoardMeta, toggleModal, toggleStarred } from '../../store/board.actions'
import { loadBoards } from '../../store/board.actions'

import { RiErrorWarningLine } from 'react-icons/ri'
import { BsBarChart, BsKanban, BsStar } from 'react-icons/bs'
import { BsStarFill } from 'react-icons/bs'
import { FiActivity } from 'react-icons/fi'
import { GrHomeRounded } from 'react-icons/gr'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { RiUserAddLine } from 'react-icons/ri'
import { Tooltip } from '@mui/material'
import { GUEST_IMG } from '../../services/avatar'
import { singleLineEditable } from '../../services/editable'
import { t } from '../../i18n'
export function BoardHeader ({ board, onSetFilter, isStarredOpen, setIsShowDescription, setIsInviteModalOpen, setBoardType, boardType }) {
    const isOpen = useSelector(storeState => storeState.boardModule.isBoardModalOpen)
    const navigate = useNavigate()

    async function onSave (ev) {
        const value = ev.target.innerText
        if (!value || value === board.title) return
        board.title = value
        try {
            await updateBoardMeta(board._id, { title: value })
            loadBoards()
        } catch (err) {
            console.log('saving failed')
        }
    }

    function onToggleStarred () {
        try {
            toggleStarred(board, isStarredOpen)
        } catch (err) {
            console.log(err)
        }
    }

    function toggleIsOpen (type) {
        navigate(`/board/${board._id}/${type}`)
    }

    function onSetBoardType (type) {
        setBoardType(type)
        closeDynamicModal()
    }

    if (!board.members) return <div></div>
    return (
        <header className="board-header">
            <section className='board-title flex align-center space-around'>
                <div className="board-info flex">
                    <Tooltip title={t('board.clickToEdit')} arrow>
                        <blockquote contentEditable onBlur={onSave} suppressContentEditableWarning={true}
                            {...singleLineEditable()}>
                            <h1>{board.title}</h1>
                        </blockquote>
                    </Tooltip>
                    <Tooltip title={t('board.showDescription')} arrow>
                        <div className='info-btn icon' onClick={() => setIsShowDescription(true)}>
                            <RiErrorWarningLine />
                        </div>
                    </Tooltip>
                    <Tooltip title={t('board.addFavorite')} arrow>
                        <div className='star-btn icon ' onClick={onToggleStarred}>
                            {!board.isStarred ? <BsStar className='star' /> : <BsStarFill className="star star-full" />}
                        </div>
                    </Tooltip>
                </div>
                <div className='board-tools flex align-center'>
                    <Tooltip title={t('board.showActivity')} arrow>
                        <div className='activity' onClick={() => toggleIsOpen('activity')}><FiActivity /></div>
                    </Tooltip>
                    <Tooltip title={t('board.showMembers')} arrow>
                        <div className='members-last-seen flex' onClick={() => toggleIsOpen('last-viewed')}>
                            <span className='last-seen-title'>{t('activity.lastSeen')}</span>
                            <div className='flex members-imgs'>
                                <img className='member-img1' src={board.members[0]?.imgUrl || GUEST_IMG} alt="member" />
                                <img className='member-img2' src={board.members[1]?.imgUrl || GUEST_IMG} alt="member" />
                                <div className='show-more-members'>
                                    <span className='show-more-count'>+2</span>
                                </div>
                            </div>
                        </div>
                    </Tooltip>
                    <Tooltip title={t('board.invite')} arrow>
                        <div className="invite" onClick={() => setIsInviteModalOpen(prev => !prev)}>
                            <RiUserAddLine className="invite-icon" />
                            <span className='invite-title'> Invite / 1</span>
                        </div>
                    </Tooltip>
                </div>
            </section>
            <div className='board-description flex'>
                {board.description && <p className='board-description-link'>{board.description} <span onClick={() => setIsShowDescription(true)}>{t('board.more')}</span></p>}
            </div>
            <div className='board-display-btns flex' >
                <Tooltip title={t('board.table')} arrow>
                    <div className={`type-btn ${boardType === 'table' ? ' active' : ''}`} onClick={() => onSetBoardType('table')} >
                        <GrHomeRounded className='icon' />
                        <span className='wide' onClick={() => onSetBoardType('table')}>{t('board.table')}</span>
                        <span className='mobile'>{t('board.table')}</span>
                    </div>
                </Tooltip>
                <Tooltip title={t('board.kanban')} arrow>
                    <div className={`type-btn ${boardType === 'kanban' ? ' active' : ''}`} onClick={() => onSetBoardType('kanban')}>
                        <BsKanban />
                        <span className='wide'  >{t('board.kanban')}</span>
                        <span className='mobile' onClick={() => onSetBoardType('kanban')}>{t('board.kanban')}</span>
                    </div>
                </Tooltip>
                <Tooltip title={t('board.dashboard')} arrow>
                    <div className={`type-btn ${boardType === 'dashboard' ? ' active' : ''}`} onClick={() => onSetBoardType('dashboard')}>
                        <BsBarChart />
                        <span className='wide' >{t('board.dashboard')}</span>
                        <span className='mobile' onClick={() => onSetBoardType('dashboard')}>{t('board.dashboard')}</span>
                    </div>
                </Tooltip>
            </div>
            <div className='board-border'></div>
            {boardType !== 'dashboard' && <BoardFilter onSetFilter={onSetFilter} board={board} />}
        </header >
    )
}
