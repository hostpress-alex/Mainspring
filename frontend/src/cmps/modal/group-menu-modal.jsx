import { HiOutlineDocumentDuplicate } from 'react-icons/hi'
import { RiDeleteBinLine } from 'react-icons/ri'
import { BsFillCircleFill } from 'react-icons/bs'
import { duplicateGroup, setDynamicModalObj, updateGroups } from '../../store/board.actions'
import { confirmDelete } from '../confirm-dialog'
import { useSelector } from 'react-redux'

export function GroupMenuModal({ dynamicModalObj }) {
    const board = useSelector(storeState => storeState.boardModule.filteredBoard)

    async function onRemoveGroup() {
        const g = dynamicModalObj.group
        const anzahl = (g?.tasks || []).length
        const ok = await confirmDelete({
            was: g?.title ? `Die Gruppe „${g.title}"` : 'Diese Gruppe',
            hinweis: anzahl ? `${anzahl} Task${anzahl === 1 ? '' : 's'} darin ${anzahl === 1 ? 'wird' : 'werden'} mit gelöscht.` : null,
            knopf: 'Gruppe löschen',
        })
        if (!ok) return
        try {
            updateGroups(dynamicModalObj.group.id, board)
            setDynamicModalObj({ ...dynamicModalObj, isOpen: false })
        } catch (err) {
            console.log('err:', err)
        }
    }

    function onDuplicateGroup() {
        try {
            duplicateGroup(board, dynamicModalObj.group)
            setDynamicModalObj({ ...dynamicModalObj, isOpen: false })
        } catch (err) {
            console.log('err:', err)
        }
    }

    function openPaletteModal() {
        dynamicModalObj.type = 'palette-modal'
        setDynamicModalObj({...dynamicModalObj})
    }

    return (
        <section className="group-menu-modal">
            <div className='color' onClick={openPaletteModal} >
                <BsFillCircleFill style={{ color: 'yellow' }} />
                <span>Gruppenfarbe ändern</span>
            </div>
            <div className="duplicate" onClick={onDuplicateGroup}>
                <HiOutlineDocumentDuplicate />
                <span>Gruppe duplizieren</span>
            </div>
            <div className="delete" onClick={onRemoveGroup}>
                <RiDeleteBinLine />
                <span>Löschen</span>
            </div>
        </section>
    )
}