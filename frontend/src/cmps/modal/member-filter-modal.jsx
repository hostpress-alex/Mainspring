import { useSelector } from "react-redux";
import { CgClose } from 'react-icons/cg'
import { setDynamicModalObj } from '../../store/board.actions'
import { GUEST_IMG } from '../../services/avatar'
import { t } from '../../i18n'

export function MemberFilterModal({dynamicModalObj}) {
    const board = useSelector(storeState => storeState.boardModule.filteredBoard)
    
    function onFilterBoard(memberId) {
        dynamicModalObj.filterBy.memberId = memberId
        dynamicModalObj.setFilterBy({...dynamicModalObj.filterBy})
    }

    return (
        <section className="filter-member-modal flex column">
            <CgClose className="close-btn" onClick={() => setDynamicModalObj({ isOpen: false})} />
            <h2>{t('task.quickFilter')}</h2>
            <div className="secondary-title">{t('task.filterByPerson')}</div>
            <ul>
                {
                    board.members.map(member => {
                        return <li key={member._id} className={dynamicModalObj.filterBy.memberId === member._id ? 'active' : ''}>
                            <img onClick={() => onFilterBoard(member._id)} src={member.imgUrl || GUEST_IMG} alt="" />
                        </li>
                    })
                }
            </ul>
    </section>
    )
}