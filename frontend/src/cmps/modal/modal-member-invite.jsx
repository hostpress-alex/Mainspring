import {useEffect, useState} from 'react'
import {useSelector} from 'react-redux'

import {loadBoard, updateBoardMembers, removeBoardMember, setMemberRoleAction} from '../../store/board.actions'
import {confirmDelete} from '../confirm-dialog'
import {boardService} from '../../services/board.service'
import {ROLES, roleOf, EDITOR, OWNER} from '../../services/board-roles'

import {Icon} from '../icon'
import {Avatar} from '../avatar'
import {t} from '../../i18n'

/**
 * Who is on this board, and as what.
 *
 * The role is chosen when somebody is invited and changed here afterwards.
 * Both go through the same list so there is one place to look — an invite
 * dialog that assigns a role and a separate screen that changes it is two
 * places to keep in step and two places to forget.
 *
 * Only an owner sees any of the controls. The server refuses the rest anyway;
 * this is so nobody is offered something that will not happen.
 */
export function ModalMemberInvite({board, setIsInviteModalOpen}){
    const [filter, setFilter] = useState({txt: ''})
    const [outBoardMembers, setOutBoardMembers] = useState([])
    const [newRole, setNewRole] = useState(EDITOR)
    const [busyId, setBusyId] = useState(null)
    const users = useSelector(storeState => storeState.userModule.users)
    const me = useSelector(storeState => storeState.userModule.user)
    const canManage = boardService.canManageMembers(board, me)

    useEffect(() => {
        setOutBoardMembers(users.filter(user => !board.members.some(member => member._id === user._id)))
    }, [users, board.members])

    const ownerCount = (board.members || []).filter(m => roleOf(board, {_id: m._id}) === OWNER).length

    async function onRemoveMember(removeMemberId){
        const m = board.members.find(x => x._id === removeMemberId)
        const ok = await confirmDelete({
            what: m?.fullname?`${m.fullname}`:t('member.thisMember'),
            note: t('member.removeNote'),
            button: t('common.remove')
        })
        if(!ok) return
        try {
            await removeBoardMember(board, removeMemberId)
            loadBoard(board._id)
        } catch(err) {
            console.error('cannot remove the member', err)
        }
    }

    async function onAddMember(member){
        try {
            // The role travels with the member, so the person arrives with the
            // rights they were meant to have rather than as an editor who is
            // corrected a moment later.
            await updateBoardMembers(board._id, [...board.members, {...member, role: newRole}])
            loadBoard(board._id)
        } catch(err) {
            console.error('cannot add the member', err)
        }
    }

    async function onChangeRole(memberId, role){
        setBusyId(memberId)
        try {
            await setMemberRoleAction(board._id, memberId, role)
        } catch(err) {
            // The server refuses to leave a board without an owner, and that
            // is the one refusal worth showing rather than swallowing.
            console.error('cannot change the role', err)
            window.alert(err?.response?.data?.err || t('role.changeFailed'))
        } finally {
            setBusyId(null)
        }
    }

    function handleChange({target}){
        const {value, name: field} = target
        setFilter(prev => ({...prev, [field]: value}))
    }

    function onSubmit(ev){
        ev.preventDefault()
        let members = users.filter(user => !board.members.some(member => member._id === user._id))
        if(filter.txt){
            const regex = new RegExp(filter.txt, 'i')
            members = members.filter(member => regex.test(member.fullname))
        }
        setOutBoardMembers(members)
    }

    return (
        <section className="modal-member invite">
            <Icon name='xmark' className="close-btn" onClick={() => setIsInviteModalOpen(false)}/>
            <Icon name='caret-up' className="triangle-icon"/>

            <section className="modal-member-content">
                <ul className="member-role-list">
                    {board.members.map(member => {
                        const role = roleOf(board, {_id: member._id})
                        // The last owner may not be demoted — the server says
                        // so too, and a control that cannot succeed should not
                        // look as though it could.
                        const isLastOwner = role === OWNER && ownerCount === 1
                        return (
                            <li key={member._id} className="member-role-row">
                                <Avatar src={member.imgUrl} alt=""/>
                                <span className="member-role-name">{member.fullname}</span>

                                {canManage?(
                                    <select
                                        className="member-role-select"
                                        value={role || EDITOR}
                                        disabled={isLastOwner || busyId === member._id}
                                        title={isLastOwner?t('role.lastOwner'):undefined}
                                        onChange={ev => onChangeRole(member._id, ev.target.value)}>
                                        {ROLES.map(r => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
                                    </select>
                                ):(
                                    <span className="member-role-static">{t(`role.${role || EDITOR}`)}</span>
                                )}

                                {canManage && !isLastOwner && (
                                    <button type="button" className="member-role-remove"
                                            title={t('common.remove')}
                                            onClick={() => onRemoveMember(member._id)}>×</button>
                                )}
                            </li>
                        )
                    })}
                </ul>

                {!canManage && <p className="invite-hint">{t('member.ownerOnly')}</p>}

                {canManage && (
                    <div className="outTaskMembers">
                        <label className="invite-role">
                            <span>{t('role.forNew')}</span>
                            <select value={newRole} onChange={ev => setNewRole(ev.target.value)}>
                                {ROLES.map(r => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
                            </select>
                        </label>

                        <form className="search-div flex space-between" onSubmit={onSubmit}>
                            <input type="text" placeholder={t('member.search')} name="txt" value={filter.txt} onChange={handleChange}/>
                            <button className="icon-container"><Icon name='magnifying-glass' className="icon"/></button>
                        </form>

                        <span>{t('member.suggestions')}</span>
                        {outBoardMembers.length > 0 && (
                            <ul className="out-member-list">
                                {outBoardMembers.map(member => (
                                    <li key={member._id} onClick={() => onAddMember(member)}>
                                        <Avatar src={member.imgUrl} alt=""/>
                                        <span>{member.fullname}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </section>
        </section>
    )
}
