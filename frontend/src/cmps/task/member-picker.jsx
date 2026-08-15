import { useRef, useState } from "react"
import { useSelector } from "react-redux"

import { BsPersonCircle } from 'react-icons/bs'
import { boardService } from "../../services/board.service"
import { setDynamicModalObj } from "../../store/board.actions"
import { GUEST_IMG } from '../../services/avatar'
export function MemberPicker({ info, onUpdate, field = 'memberIds' }) {
    const board = useSelector(storeState => storeState.boardModule.board)
    const dynamicModalObj = useSelector(storeState => storeState.boardModule.dynamicModalObj)
    const [isModalOpen, setIsModalOpen] = useState(false)

    const activity = boardService.getEmptyActivity()
    activity.action = 'person'
    activity.task = { id: info.id, title: info.title }

    // getMember returns undefined when a memberId is no longer in the board
    const members = (info[field] || []).map(member => getMember(member)).filter(Boolean)
    const elMemberSection = useRef()

    function getMember(memberId) {
        return board.members.find(member => member._id === memberId)
    }

    function onToggleMenuModal() {
        const isOpen = dynamicModalObj?.task?.id === info.id && dynamicModalObj?.type === 'member-modal' ? !dynamicModalObj.isOpen : true
        const { x, y } = elMemberSection.current.getClientRects()[0]
        setDynamicModalObj({ isOpen, pos: { x: (x - 140), y: (y + 40 ) }, type: 'member-modal', field, task: info, onTaskUpdate: onUpdate, activity: activity })
    }

    return (
        <section className="task-person" ref={elMemberSection} onClick={onToggleMenuModal}>
            <div className="members-imgs" >
                {members.length === 0 && <BsPersonCircle className="icon-person" />}
                {members.length > 0 && <img className='member-img1' src={members[0]?.imgUrl || GUEST_IMG} alt="member" onClick={() => setIsModalOpen(!isModalOpen)} />}
                {members.length === 2 && <img className='member-img2' src={members[1]?.imgUrl || GUEST_IMG} alt="member" onClick={() => setIsModalOpen(!isModalOpen)} />}
                {members.length > 2 && <div className='show-more-members'>
                    <span className='show-more-count'>+{members.length - 1}</span>
                </div>}
            </div>
            {/* {isModalOpen && <ModalMember taskMembers={members} onUpdate={onUpdate} setIsModalOpen={setIsModalOpen} cmpType={'memberIds'} activity={activity} />} */}
        </section>
    )
}

