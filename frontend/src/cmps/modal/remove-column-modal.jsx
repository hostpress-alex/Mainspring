import {useSelector} from 'react-redux'
import {FiTrash} from 'react-icons/fi'
import {loadBoard, setDynamicModalObj, updateBoardColumns} from '../../store/board.actions'
import {confirmDelete} from '../confirm-dialog'
import {t} from '../../i18n'

export function RemoveColumnModal({dynamicModalObj}){
    const board = useSelector(storeState => storeState.boardModule.filteredBoard)

    async function onRemoveColumn(){
        const column = (board.columns || []).find(col => col.id === dynamicModalObj.columnId)
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
            <li onClick={onRemoveColumn}>
                <FiTrash className="icon"/> {t('column.delete')}
            </li>
        </ul>
    )
}
