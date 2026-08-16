import { Icon } from '../icon'
import {duplicateGroup, setDynamicModalObj, updateGroups} from '../../store/board.actions'
import {confirmDelete} from '../confirm-dialog'
import {useSelector} from 'react-redux'
import {t} from '../../i18n'

export function GroupMenuModal({dynamicModalObj}){
    const board = useSelector(storeState => storeState.boardModule.filteredBoard)

    async function onRemoveGroup(){
        const g = dynamicModalObj.group
        const count = (g?.tasks || []).length
        const ok = await confirmDelete({
            what: g?.title?t('group.deleteName', {title: g.title}):t('group.thisGroup'),
            note: count?t('group.deleteNote', {n: count}):null,
            button: t('group.delete')
        })
        if(!ok) return
        try {
            updateGroups(dynamicModalObj.group.id, board)
            setDynamicModalObj({...dynamicModalObj, isOpen: false})
        } catch(err) {
            console.log('err:', err)
        }
    }

    function onDuplicateGroup(){
        try {
            duplicateGroup(board, dynamicModalObj.group)
            setDynamicModalObj({...dynamicModalObj, isOpen: false})
        } catch(err) {
            console.log('err:', err)
        }
    }

    function openPaletteModal(){
        dynamicModalObj.type = 'palette-modal'
        setDynamicModalObj({...dynamicModalObj})
    }

    return (
        <section className="group-menu-modal">
            <div className="color" onClick={openPaletteModal}>
                <Icon name='circle' className="group-color-dot"/>
                <span>{t('group.changeColor')}</span>
            </div>
            <div className="duplicate" onClick={onDuplicateGroup}>
                <Icon name='clone' style='fa-regular'/>
                <span>{t('group.duplicate')}</span>
            </div>
            <div className="delete" onClick={onRemoveGroup}>
                <Icon name='trash-can' style='fa-regular'/>
                <span>{t('common.delete')}</span>
            </div>
        </section>
    )
}