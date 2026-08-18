import {addTaskOnFirstGroup, setDynamicModalObj} from '../../store/board.actions'
import {useEffect, useRef, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useEffectUpdate} from '../../customHooks/useEffectUpdate'
import {utilService} from '../../services/util.service'

import { Icon } from '../icon'
import {useSelector} from 'react-redux'
import {Tooltip} from '@mui/material'
import { Avatar } from '../avatar'
import * as boardRoles from '../../services/board-roles'
import {t} from '../../i18n'
import {FilterPanel} from '../filter/filter-panel'
import {hasRules} from '../../services/board-filter'
import {useDismissable} from '../../customHooks/useDismissable'

/** How many faces fit before it turns into a "+3". */
const SHOWN_MEMBERS = 3

export function BoardFilter({board, onSetFilter, setIsInviteModalOpen, activeTab, onUpdateView}){
    const filter = useSelector(storeState => storeState.boardModule.filter)
    const [filterBy, setFilterBy] = useState(filter)
    const [memberFilter, setMemberFilter] = useState(null)
    const [isPanelOpen, setIsPanelOpen] = useState(false)
    const dynamicModalObj = useSelector(storeState => storeState.boardModule.dynamicModalObj)
    const elBoardFilter = useRef()
    const elMemberFilter = useRef()
    const navigate = useNavigate()
    const panelRef = useDismissable(isPanelOpen, () => setIsPanelOpen(false))

    /**
     * One debounced sender for the life of the component, calling whatever
     * onSetFilter currently is.
     *
     * It used to debounce the prop itself into a ref, which froze the first
     * one. That closure holds the board id from the moment this was first
     * rendered, and all three /board/... routes share one BoardDetails — so
     * after switching boards, typing in the search box reloaded the board you
     * had come from.
     */
    const latestSet = useRef(onSetFilter)
    latestSet.current = onSetFilter

    /**
     * Two refs decide who last had a say.
     *
     * `shown` is what the panel is displaying, `settled` is what has already
     * been agreed with the outside world — either because we sent it, or
     * because it arrived from there. The debounced send compares the two and
     * does nothing when they match, so an outside change cannot be undone a
     * moment later by a timer that was already running.
     */
    const shown = useRef(filterBy)
    const settled = useRef(filterBy)

    const sendFilter = useRef(utilService.debounce(() => {
        if(shown.current === settled.current) return
        settled.current = shown.current
        latestSet.current(shown.current)
    }))

    /**
     * A filter that came from outside — a tab was opened, or another board.
     *
     * This used to watch board._id, which meant switching TABS left the panel
     * showing the rules of the tab before it: the board was filtered
     * correctly and the panel disagreed with it, which is worse than either
     * being wrong on its own.
     */
    useEffect(() => {
        if(filter === settled.current) return
        shown.current = filter
        settled.current = filter
        setFilterBy(filter)
        setIsPanelOpen(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter])

    useEffectUpdate(() => {
        shown.current = filterBy
        loadMemberImg()
        sendFilter.current()
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
        setMemberFilter(null)
        setFilterBy(prev => ({...prev, memberId: ''}))
    }

    function openBoardPanel(type){
        navigate(`/board/${board._id}/${type}`)
    }

    // Adding a group and adding a task are both editor work — see
    // services/board-roles.js.
    const me = useSelector(storeState => storeState.userModule.user)
    const canManage = boardRoles.canEdit(board, me)

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
            {canManage && <Tooltip title={t('task.createNew')} arrow>
                <div className="add-btn">
                    <span className="new-task-btn" onClick={() => addTaskOnFirstGroup(board)}>{t('task.new')}</span>
                    {/* The arrow is only "add a group", which is structure. */}
                    {canManage && (
                        <div className="drop-down-btn" onClick={onToggleMenuModal}>
                            <Icon name='angle-down' className="icon"/>
                        </div>
                    )}
                </div>
            </Tooltip>}
            <div className="board-tools flex align-center">
                <Tooltip title={t('common.search')} arrow>
                    <div className="search-task">
                        <Icon name='magnifying-glass' className="icon"/>
                        <input type="text" name="title" value={filterBy.title} placeholder={t('common.search')} onChange={handleChange}/>
                    </div>
                </Tooltip>
                {/* The quick filters stay where they are — looking for a
                    title is the commonest thing anybody does here. The rules
                    are one click further in. */}
                {/* Trigger and panel in one box: the panel hangs off this box,
                    and the outside-click handler counts the button as inside —
                    otherwise the click that closes the panel is followed by
                    the button's own onClick, which opens it again. */}
                <div className="filter-anchor" ref={panelRef}>
                    <Tooltip title={t('filter.title2')} arrow>
                        <div className={`filter-btn${hasRules(filterBy.rules)?' active':''}`}
                            onClick={() => setIsPanelOpen(open => !open)}>
                            <Icon name='filter'/>
                            <span className="wide">{t('filter.title2')}</span>
                            {hasRules(filterBy.rules) &&
                                <span className="filter-count">{filterBy.rules.filter(r => r && r.field).length}</span>}
                        </div>
                    </Tooltip>
                    {isPanelOpen && (
                        <FilterPanel board={board} filter={filterBy} me={me}
                            activeTab={activeTab} onUpdateView={onUpdateView}
                            onChange={next => setFilterBy(next)}
                            onClose={() => setIsPanelOpen(false)}/>
                    )}
                </div>
                <Tooltip title={t('task.filterByPerson')} arrow>
                    <div ref={elMemberFilter} onClick={onToggleMemberFilterModal} className={`person-filter ${(isMemberModalOpen() || filterBy.memberId)?' active':''}`}>
                        {!memberFilter && <Icon name='circle-user' className="icon"/>}
                        {memberFilter && <Avatar className="member-img" src={memberFilter.imgUrl}/>}
                        <span>{t('common.person')}</span>
                        {filterBy.memberId && <Icon name='circle-xmark' onClick={onRemovePersonFilter}/>}
                    </div>
                </Tooltip>
            </div>

            {/* Members and activity belong to THIS board, so they sit in the
                board's own toolbar. Up in the title row, flush right, they read
                like an application bar — as if you were inviting someone into
                the whole tool rather than into one board. */}
            <div className="board-members flex align-center">
                <Tooltip title={t('board.showActivity')} arrow>
                    <div className="activity" onClick={() => openBoardPanel('activity')}><Icon name='clock-rotate-left'/></div>
                </Tooltip>
                <Tooltip title={t('board.showMembers')} arrow>
                    <div className="members-last-seen flex" onClick={() => openBoardPanel('last-viewed')}>
                        <span className="last-seen-title">{t('activity.lastSeen')}</span>
                        <div className="flex members-imgs">
                            {members.slice(0, SHOWN_MEMBERS).map(member => (
                                <Avatar key={member._id} className="member-img" src={member.imgUrl} alt="" title={member.fullname}/>
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
                        <Icon name='user-plus' className="invite-icon"/>
                        <span className="invite-title">{t('board.inviteWithCount', {n: members.length})}</span>
                    </div>
                </Tooltip>
            </div>
        </section>
    )
}