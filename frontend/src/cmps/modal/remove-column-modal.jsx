import { useSelector } from 'react-redux'
import { FiTrash } from 'react-icons/fi'
import { loadBoard, setDynamicModalObj, updateBoardColumns } from '../../store/board.actions'
import { confirmDelete } from '../confirm-dialog'

export function RemoveColumnModal ({ dynamicModalObj }) {
    const board = useSelector(storeState => storeState.boardModule.filteredBoard)

    async function onRemoveColumn () {
        const spalte = (board.columns || []).find(col => col.id === dynamicModalObj.columnId)
        const ok = await confirmDelete({
            was: spalte?.title ? `Die Spalte „${spalte.title}"` : 'Diese Spalte',
            hinweis: 'Die Werte dieser Spalte gehen bei allen Tasks des Boards verloren.',
            knopf: 'Spalte löschen',
        })
        if (!ok) return
        try {
            const columns = (board.columns || []).filter(col => col.id !== dynamicModalObj.columnId)
            await updateBoardColumns(board, columns)
            loadBoard(board._id)
            setDynamicModalObj({ ...dynamicModalObj, isOpen: false })
        } catch (err) {
            console.log('Spalte konnte nicht entfernt werden', err)
        }
    }

    return (
        <ul className='remove-column-modal'>
            <li onClick={onRemoveColumn}>
                <FiTrash className='icon' /> Spalte löschen
            </li>
        </ul>
    )
}
