import { useEffect, useState } from "react"
import { useSelector } from "react-redux"

import { loadBoard, updateBoardMembers, removeBoardMember } from "../../store/board.actions"
import { confirmDelete } from "../confirm-dialog"
import { boardService } from "../../services/board.service"

import { VscTriangleUp } from 'react-icons/vsc'
import { CiSearch } from 'react-icons/ci'
import { CgClose } from 'react-icons/cg'
import { GUEST_IMG } from '../../services/avatar'
import { t } from '../../i18n'

export function ModalMemberInvite({ board, setIsInviteModalOpen }) {
    const [filter, setFilter] = useState({ txt: '' })
    const [outBoardMembers, setOutBoardMembers] = useState([])
    const users = useSelector(storeState => storeState.userModule.users)
    const me = useSelector(storeState => storeState.userModule.user)
    const canManage = boardService.canManageMembers(board, me)

    useEffect(() => {
        setOutBoardMembers(users.filter(user => !board.members.some(member => member._id === user._id)))
    }, [])

    async function onRemoveMember(removeMemberId) {
        const m = board.members.find(x => x._id === removeMemberId)
        const ok = await confirmDelete({
            what: m?.fullname ? `${m.fullname}` : t('member.thisMember'),
            note: t('member.removeNote'),
            button: t('common.remove'),
        })
        if (!ok) return
        try {
            await removeBoardMember(board, removeMemberId)
            loadBoard(board._id)
            setIsInviteModalOpen(false)
        } catch (err) {
            console.log('cant save board:', err)
        }
    }

    async function onAddMember(member) {
        try {
            await updateBoardMembers(board._id, [...board.members, member])
            loadBoard(board._id)
            setIsInviteModalOpen(false)
        } catch (err) {
            console.log('cant save board:', err)
        }
        
    }

    function handleChange({ target }) {
        let { value, name: field } = target
        setFilter((prevFilter) => ({ ...prevFilter, [field]: value }))
    }

    function onSubmit(ev) {
        ev.preventDefault()
        let members = users.filter(user => !board.members.some(member => member._id === user._id))
        if (filter.txt) {
            const regex = new RegExp(filter.txt, 'i')
            members = members.filter(member => regex.test(member.fullname))
        }

        setOutBoardMembers(members)
    }

    return (
        <section className="modal-member invite">
            <CgClose className="close-btn" onClick={() => setIsInviteModalOpen(false)} />
            <VscTriangleUp className="triangle-icon" />
            <section className="modal-member-content" >
                <ul className="taskMembers flex">
                    {
                        board.members.map(member => {
                            return <li key={member._id}>
                                <img src={member.imgUrl || GUEST_IMG} alt="member-img" />
                                <span>{member.fullname}</span>
                                {canManage && <span onClick={() => onRemoveMember(member._id)} className="remove">x</span>}
                            </li>
                        })
                    }
                </ul>
                {!canManage && <p style={{ padding: '8px 4px', color: '#676879', fontSize: 13 }}>
                    Nur Owner dieses Boards koennen Mitglieder hinzufuegen oder entfernen.
                </p>}
                {canManage && <div className="outTaskMembers">
                    <form className="search-div flex space-between" onSubmit={onSubmit}>
                        <input type="text"
                            placeholder={t('member.search')}
                            name="txt"
                            value={filter.txt}
                            onChange={handleChange}
                        />
                        <button className="icon-container"><CiSearch className="icon" /></button>
                    </form>
                    <span>{t('member.suggestions')}</span>
                    {outBoardMembers.length > 0 && <ul className="out-member-list">
                        {
                            outBoardMembers.map(member => {
                                return <li key={member._id} onClick={() => onAddMember(member)}>
                                    <img src={member.imgUrl || GUEST_IMG} alt="member-img"/>
                                    <span>{member.fullname}</span>
                                </li>
                            })
                        }
                    </ul>}
                </div>}
            </section>
        </section>
    )
}