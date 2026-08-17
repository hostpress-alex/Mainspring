import { Icon } from '../icon'
import {duplicateGroup, setDynamicModalObj, removeGroupAction, setGroupStateAction} from '../../store/board.actions'
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
            removeGroupAction(dynamicModalObj.group.id, board)
            setDynamicModalObj({...dynamicModalObj, isOpen: false})
        } catch(err) {
            console.log('err:', err)
        }
    }

    async function onArchiveGroup(){
        try {
            await setGroupStateAction(board, dynamicModalObj.group.id, 'archived')
            setDynamicModalObj({...dynamicModalObj, isOpen: false})
        } catch(err) {
            console.error('archiving the group failed', err)
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

    /**
     * Swap the same popup over to a picker, keeping where it sits.
     *
     * A new object, not `dynamicModalObj.type = …` followed by a spread: that
     * wrote into the object the store holds before handing it back, which
     * works by accident here and is the exact shape of the bug that cost the
     * group colour a day.
     */
    function openPicker(type){
        setDynamicModalObj({...dynamicModalObj, type})
    }

    return (
        <section className="group-menu-modal">
            <div className="color" onClick={() => openPicker('palette-modal')}>
                <Icon name='circle' className="group-color-dot"/>
                <span>{t('group.changeColor')}</span>
            </div>
            <div className="group-symbol" onClick={() => openPicker('group-icon')}>
                {/* The current symbol where the colour dot sits above it, so
                    the entry shows what it changes. A face for a group that
                    has none yet. */}
                {dynamicModalObj.group?.icon
                    ?<span className="group-menu-emoji">{dynamicModalObj.group.icon}</span>
                    :<Icon name='face-smile'/>}
                <span>{t('group.icon')}</span>
            </div>
            <div className="duplicate" onClick={onDuplicateGroup}>
                <Icon name='clone' variant='fa-regular'/>
                <span>{t('group.duplicate')}</span>
            </div>
            <div className="archive" onClick={onArchiveGroup}>
                <Icon name='box-archive'/>
                <span>{t('common.archive')}</span>
            </div>
            <div className="delete" onClick={onRemoveGroup}>
                <Icon name='trash-can' variant='fa-regular'/>
                <span>{t('common.delete')}</span>
            </div>
        </section>
    )
}