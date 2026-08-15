import {addTaskOnFirstGroup, setDynamicModalObj} from '../../store/board.actions'
import {useRef, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useEffectUpdate} from '../../customHooks/useEffectUpdate'
import {utilService} from '../../services/util.service'

import {FaAngleDown} from 'react-icons/fa'
import {TfiSearch} from 'react-icons/tfi'
import {BsPersonCircle} from 'react-icons/bs'
import {AiFillCloseCircle} from 'react-icons/ai'
import {FiActivity} from 'react-icons/fi'
import {RiUserAddLine} from 'react-icons/ri'
import {useSelector} from 'react-redux'
import {Tooltip} from '@mui/material'
import {GUEST_IMG} from '../../services/avatar'
import {t} from '../../i18n'

/** How many faces fit before it turns into a "+3". */
const SHOWN_MEMBERS = 3

export function BoardFilter({board, onSetFilter, setIsInviteModalOpen}){
    const filter = useSelector(storeState => storeState.boardModule.filter)
    const [filterBy, setFilterBy] = useState(filter)
    const [memberFilter, setMemberFilter] = useState(null)
    const dynamicModalObj = useSelector(storeState => storeState.boardModule.dynamicModalObj)
    const elBoardFilter = useRef()
    const elMemberFilter = useRef()
    const navigate = useNavigate()
    onSetFilter = useRef(utilService.debounce(onSetFilter))

    useEffectUpdate(() => {
        onSetFilter.current(filterBy)
        loadMemberImg()
    }, [filterBy])

    function loadMemberImg(){
        const member = board.members.find(member => member._id === filterBy.memberId)
        setMemberFilter(member)
    }

    function handleChange({target}){
        let {value, name: field} = target
        setFilterBy((prevFilter) => ({...prevFilter, [field]: value}))
    }

    function onRemovePersonFilter(ev){
        ev.stopPropagation()
        filter.memberId = ''
        onSetFilter.current(filter)
        setMemberFilter(null)
    }

    function openBoardPanel(type){
        navigate(`/board/${board._id}/${type}`)
    }

    function onToggleMenuModal(){
        const isOpen = dynamicModalObj?.type === 'add-group'?!dynamicModalObj.isOpen:true
        const {x, y, height} = elBoardFilter.current.getClientRects()[0]
        setDynamicModalObj({isOpen, pos: {x: (x + 80), y: (y + height)}, type: 'add-group'})
    }

    function onToggleMemberFilterModal(){
        const isOpen = dynamicModalObj?.type === 'member-filter'?!dynamicModalObj.isOpen:true
        const {x, y} = elMemberFilter.current.getClientRects()[0]
        setDynamicModalObj({
            isOpen,
            pos: {x: (x - 160), y: (y + 40)},
            type: 'member-filter',
            filterBy: filterBy,
            setFilterBy: setFilterBy
        })
    }

    function isMemberModalOpen(){
        return dynamicModalObj.isOpen && dynamicModalObj.type === 'member-filter'
    }

    const members = board.members || []

    return (
        <section ref={elBoardFilter} className="board-filter flex align-center">
            <Tooltip title={t('task.createNew')} arrow>
                <div className="add-btn">
                    <span className="new-task-btn" onClick={() => addTaskOnFirstGroup(board)}>{t('task.new')}</span>
                    <div className="drop-down-btn" onClick={onToggleMenuModal}>
                        <FaAngleDown className="icon"/>
                    </div>
                </div>
            </Tooltip>
            <div className="board-tools flex align-center">
                <Tooltip title={t('common.search')} arrow>
                    <div className="search-task">
                        <TfiSearch className="icon"/>
                        <input type="text" name="title" value={filterBy.title} placeholder={t('common.search')} onChange={handleChange}/>
                    </div>
                </Tooltip>
                <Tooltip title={t('task.filterByPerson')} arrow>
                    <div ref={elMemberFilter} onClick={onToggleMemberFilterModal} className={`person-filter ${(isMemberModalOpen() || filterBy.memberId)?' active':''}`}>
                        {!memberFilter && <BsPersonCircle className="icon"/>}
                        {memberFilter && <img className="member-img" src={memberFilter.imgUrl || GUEST_IMG} alt=""/>}
                        <span>{t('common.person')}</span>
                        {filterBy.memberId && <AiFillCloseCircle onClick={onRemovePersonFilter}/>}
                    </div>
                </Tooltip>
            </div>

            {/* Members and activity belong to THIS board, so they sit in the
                board's own toolbar. Up in the title row, flush right, they read
                like an application bar — as if you were inviting someone into
                the whole tool rather than into one board. */}
            <div className="board-members flex align-center">
                <Tooltip title={t('board.showActivity')} arrow>
                    <div className="activity" onClick={() => openBoardPanel('activity')}><FiActivity/></div>
                </Tooltip>
                <Tooltip title={t('board.showMembers')} arrow>
                    <div className="members-last-seen flex" onClick={() => openBoardPanel('last-viewed')}>
                        <span className="last-seen-title">{t('activity.lastSeen')}</span>
                        <div className="flex members-imgs">
                            {members.slice(0, SHOWN_MEMBERS).map(member => (
                                <img key={member._id} className="member-img" src={member.imgUrl || GUEST_IMG} alt="" title={member.fullname}/>
                            ))}
                            {members.length > SHOWN_MEMBERS && (
                                <div className="show-more-members">
                                    <span className="show-more-count">+{members.length - SHOWN_MEMBERS}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </Tooltip>
                <Tooltip title={t('board.invite')} arrow>
                    <div className="invite" onClick={() => setIsInviteModalOpen(true)}>
                        <RiUserAddLine className="invite-icon"/>
                        <span className="invite-title">{t('board.inviteWithCount', {n: members.length})}</span>
                    </div>
                </Tooltip>
            </div>
        </section>
    )
}