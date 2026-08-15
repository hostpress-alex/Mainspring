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
            console.log('Speichern fehlgeschlagen')
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
                    <Tooltip title="Zum Bearbeiten klicken" arrow>
                        <blockquote contentEditable onBlur={onSave} suppressContentEditableWarning={true}
                            {...singleLineEditable()}>
                            <h1>{board.title}</h1>
                        </blockquote>
                    </Tooltip>
                    <Tooltip title="Board-Beschreibung anzeigen" arrow>
                        <div className='info-btn icon' onClick={() => setIsShowDescription(true)}>
                            <RiErrorWarningLine />
                        </div>
                    </Tooltip>
                    <Tooltip title="Zu den Favoriten" arrow>
                        <div className='star-btn icon ' onClick={onToggleStarred}>
                            {!board.isStarred ? <BsStar className='star' /> : <BsStarFill className="star star-full" />}
                        </div>
                    </Tooltip>
                </div>
                <div className='board-tools flex align-center'>
                    <Tooltip title="Board-Verlauf anzeigen" arrow>
                        <div className='activity' onClick={() => toggleIsOpen('activity')}><FiActivity /></div>
                    </Tooltip>
                    <Tooltip title="Board-Mitglieder anzeigen" arrow>
                        <div className='members-last-seen flex' onClick={() => toggleIsOpen('last-viewed')}>
                            <span className='last-seen-title'>Zuletzt geöffnet</span>
                            <div className='flex members-imgs'>
                                <img className='member-img1' src={board.members[0]?.imgUrl || GUEST_IMG} alt="member" />
                                <img className='member-img2' src={board.members[1]?.imgUrl || GUEST_IMG} alt="member" />
                                <div className='show-more-members'>
                                    <span className='show-more-count'>+2</span>
                                </div>
                            </div>
                        </div>
                    </Tooltip>
                    <Tooltip title="Mitglieder einladen" arrow>
                        <div className="invite" onClick={() => setIsInviteModalOpen(prev => !prev)}>
                            <RiUserAddLine className="invite-icon" />
                            <span className='invite-title'> Invite / 1</span>
                        </div>
                    </Tooltip>
                </div>
            </section>
            <div className='board-description flex'>
                {board.description && <p className='board-description-link'>{board.description} <span onClick={() => setIsShowDescription(true)}>See More</span></p>}
            </div>
            <div className='board-display-btns flex' >
                <Tooltip title="Tabelle" arrow>
                    <div className={`type-btn ${boardType === 'table' ? ' active' : ''}`} onClick={() => onSetBoardType('table')} >
                        <GrHomeRounded className='icon' />
                        <span className='wide' onClick={() => onSetBoardType('table')}>Tabelle</span>
                        <span className='mobile'>Tabelle</span>
                    </div>
                </Tooltip>
                <Tooltip title="Kanban" arrow>
                    <div className={`type-btn ${boardType === 'kanban' ? ' active' : ''}`} onClick={() => onSetBoardType('kanban')}>
                        <BsKanban />
                        <span className='wide'  >Kanban</span>
                        <span className='mobile' onClick={() => onSetBoardType('kanban')}>Kanban</span>
                    </div>
                </Tooltip>
                <Tooltip title="Auswertung" arrow>
                    <div className={`type-btn ${boardType === 'dashboard' ? ' active' : ''}`} onClick={() => onSetBoardType('dashboard')}>
                        <BsBarChart />
                        <span className='wide' >Auswertung</span>
                        <span className='mobile' onClick={() => onSetBoardType('dashboard')}>Auswertung</span>
                    </div>
                </Tooltip>
            </div>
            <div className='board-border'></div>
            {boardType !== 'dashboard' && <BoardFilter onSetFilter={onSetFilter} board={board} />}
        </header >
    )
}
