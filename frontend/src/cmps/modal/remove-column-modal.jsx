import {useSelector} from 'react-redux'
import { Icon } from '../icon'
import {loadBoard, setDynamicModalObj, updateBoardColumns} from '../../store/board.actions'
import {confirmDelete} from '../confirm-dialog'
import {isOnCard, toggledCardColumns} from '../../services/kanban-card'
import {t} from '../../i18n'

/**
 * The menu of one column.
 *
 * Still called RemoveColumnModal because that is all it held for a long time,
 * and renaming the file means renaming the `remove-column` case in
 * dynamic-modal, the SCSS partial and the two call sites — worth doing, not
 * worth doing in the middle of something else.
 */
export function RemoveColumnModal({dynamicModalObj}){
    const board = useSelector(storeState => storeState.boardModule.filteredBoard)
    const column = (board?.columns || []).find(col => col.id === dynamicModalObj.columnId) || null
    const onCard = isOnCard(board, column)

    /**
     * Show this column on the Kanban card, or stop showing it.
     *
     * The flag rides in the column's own settings, which is a free JSON bag on
     * the way to the database and back — so this is an ordinary column write
     * and needed nothing on the server.
     */
    async function onToggleCard(){
        try {
            await updateBoardColumns(board, toggledCardColumns(board, dynamicModalObj.columnId))
            setDynamicModalObj({...dynamicModalObj, isOpen: false})
        } catch(err) {
            console.log('cannot change the card columns', err)
        }
    }

    async function onRemoveColumn(){
        const ok = await confirmDelete({
            what: column?.title?t('column.deleteName', {title: column.title}):t('column.thisColumn'),
            note: t('column.deleteNote'),
            button: t('column.delete')
        })
        if(!ok) return
        try {
            const columns = (board.columns || []).filter(col => col.id !== dynamicModalObj.columnId)
            await updateBoardColumns(board, columns)
            loadBoard(board._id)
            setDynamicModalObj({...dynamicModalObj, isOpen: false})
        } catch(err) {
            console.log('removing a column failed', err)
        }
    }

    return (
        <ul className="remove-column-modal">
            <li onClick={onToggleCard}>
                {/* Two separate elements rather than one with a computed
                    name: scripts/check-icons.mjs matches `<Icon name='...'`
                    literally and cannot see a name chosen at runtime, so a
                    ternary here is an icon nobody checks. Both are free. */}
                {onCard
                    ?<Icon name='eye-slash' className="icon"/>
                    :<Icon name='eye' className="icon"/>}
                {onCard?t('column.hideOnCard'):t('column.showOnCard')}
            </li>
            <li onClick={onRemoveColumn}>
                <Icon name='trash-can' variant='fa-regular' className="icon"/> {t('column.delete')}
            </li>
        </ul>
    )
}
