import React from 'react'
import { Icon } from '../icon'
import {useSelector} from 'react-redux'
import {addGroup, setDynamicModalObj} from '../../store/board.actions'
import {t} from '../../i18n'

export function AddGroupModal({dynamicModalObj}){
    const board = useSelector(storeState => storeState.boardModule.filteredBoard)

    function onAddGroup(){
        try {
            addGroup(board)
            setDynamicModalObj({...dynamicModalObj, isOpen: false})
        } catch(err) {
            console.log('cant add group:', err)
        }
    }

    return (
        <div className="add-group-modal">
            <div className="add-group" onClick={onAddGroup}>
                <Icon name='table-list' className="icon"/>
                <span>{t('group.new')}</span>
            </div>
        </div>
    )
}
