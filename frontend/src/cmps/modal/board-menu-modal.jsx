import { useState } from 'react'
import { HiOutlineDocumentDuplicate } from 'react-icons/hi'
import { FiTrash } from 'react-icons/fi'
import { MdOutlineFolder } from 'react-icons/md'
import { updateBoardMeta, loadBoards, setDynamicModalObj } from '../../store/board.actions'

/**
 * Menue eines Boards in der Seitenleiste.
 *
 * Frueher wurde hier `filteredBoard` aus dem Store benutzt — also immer das
 * gerade geoeffnete Board, egal auf wessen Menue man geklickt hat. Jetzt kommt
 * das betroffene Board ueber dynamicModalObj.board herein.
 */
export function BoardMenuModal({ dynamicModalObj }) {
    const board = dynamicModalObj.board
    const [isFolderOpen, setIsFolderOpen] = useState(false)
    const [folder, setFolder] = useState(board?.folder || '')

    function close() {
        setDynamicModalObj({ isOpen: false })
    }

    function onRemoveBoard() {
        close()
        dynamicModalObj.onRemove(board._id)
    }

    function onDuplicateBoard() {
        close()
        dynamicModalObj.onDuplicate(board)
    }

    async function onSaveFolder(ev) {
        ev.preventDefault()
        try {
            await updateBoardMeta(board._id, { folder: folder.trim() })
            await loadBoards()
            close()
        } catch (err) {
            console.log('Gruppe konnte nicht gespeichert werden', err)
        }
    }

    return (
        <section className="board-menu-modal">
            {!isFolderOpen && (
                <>
                    <div className="folder" onClick={() => setIsFolderOpen(true)}>
                        <MdOutlineFolder />
                        <span>Gruppe ändern</span>
                    </div>
                    <div className="duplicate" onClick={onDuplicateBoard}>
                        <HiOutlineDocumentDuplicate />
                        <span>Board duplizieren</span>
                    </div>
                    <div className="delete" onClick={onRemoveBoard}>
                        <FiTrash />
                        <span>Löschen</span>
                    </div>
                </>
            )}

            {isFolderOpen && (
                <form onSubmit={onSaveFolder} style={{ padding: 10, minWidth: 210 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#676879', marginBottom: 5 }}>
                        Gruppe (z.B. IT, Marketing)
                    </label>
                    <input autoFocus value={folder} placeholder="leer = Ohne Gruppe"
                        onChange={e => setFolder(e.target.value)}
                        style={{ width: '100%', padding: '7px 9px', border: '1px solid #c3c6d4',
                            borderRadius: 5, font: 'inherit' }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 9 }}>
                        <button type="submit" style={{ flex: 1, padding: '6px 10px', border: 'none',
                            borderRadius: 5, background: '#0073ea', color: '#fff', cursor: 'pointer' }}>
                            Speichern
                        </button>
                        <button type="button" onClick={close} style={{ padding: '6px 10px',
                            border: '1px solid #c3c6d4', borderRadius: 5, background: '#fff', cursor: 'pointer' }}>
                            Abbrechen
                        </button>
                    </div>
                </form>
            )}
        </section>
    )
}
