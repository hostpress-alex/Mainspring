import {useSelector} from 'react-redux';
import { Icon } from '../icon'
import {setDynamicModalObj} from '../../store/board.actions'
import { Avatar } from '../avatar'
import {t} from '../../i18n'

export function MemberFilterModal({dynamicModalObj}){
    const board = useSelector(storeState => storeState.boardModule.filteredBoard)

    function onFilterBoard(memberId){
        dynamicModalObj.filterBy.memberId = memberId
        dynamicModalObj.setFilterBy({...dynamicModalObj.filterBy})
    }

    return (
        <section className="filter-member-modal flex column">
            <Icon name='xmark' className="close-btn" onClick={() => setDynamicModalObj({isOpen: false})}/>
            <h2>{t('task.quickFilter')}</h2>
            <div className="secondary-title">{t('task.filterByPerson')}</div>
            <ul>
                {
                    board.members.map(member => {
                        return <li key={member._id} className={dynamicModalObj.filterBy.memberId === member._id?'active':''}>
                            <Avatar onClick={() => onFilterBoard(member._id)} src={member.imgUrl}/>
                        </li>
                    })
                }
            </ul>
        </section>
    )
}