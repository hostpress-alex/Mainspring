import React from 'react'
import { BsArrowDownCircle } from 'react-icons/bs'
import { CgViewComfortable } from 'react-icons/cg'
import { useSelector } from 'react-redux'
import { addGroup, setDynamicModalObj } from '../../store/board.actions'
import { t } from '../../i18n'

export function AddGroupModal({ dynamicModalObj }) {
    const board = useSelector(storeState => storeState.boardModule.filteredBoard)

    function onAddGroup() {
        try {
            addGroup(board)
            setDynamicModalObj({ ...dynamicModalObj, isOpen: false })
        } catch (err) {
            console.log('cant add group:', err)
        }
    }
    return (
        <div className='add-group-modal'>
            <div className='add-group' onClick={onAddGroup}>
                <CgViewComfortable className='icon' />
                <span>{t('group.new')}</span>
            </div>
            <div className='import-tasks'>
                <BsArrowDownCircle className='icon' />
                <span>{t('task.import')}</span>
            </div>
        </div>
    )
}
