import {useState} from 'react'
import { Icon } from '../icon'
import {updateBoardMeta, loadBoards, setDynamicModalObj} from '../../store/board.actions'
import {t} from '../../i18n'

/**
 * Menu of a board in the sidebar.
 *
 * This used to use `filteredBoard` from the store — that is, always the board
 * currently open, no matter whose menu you clicked. Now the board in question
 * comes in via dynamicModalObj.board.
 */
export function BoardMenuModal({dynamicModalObj}){
    const board = dynamicModalObj.board
    const [isFolderOpen, setIsFolderOpen] = useState(false)
    const [folder, setFolder] = useState(board?.folder || '')

    function close(){
        setDynamicModalObj({isOpen: false})
    }

    function onRemoveBoard(){
        close()
        dynamicModalObj.onRemove(board._id)
    }

    function onDuplicateBoard(){
        close()
        dynamicModalObj.onDuplicate(board)
    }

    async function onSaveFolder(ev){
        ev.preventDefault()
        try {
            await updateBoardMeta(board._id, {folder: folder.trim()})
            await loadBoards()
            close()
        } catch(err) {
            console.log('saving a group failed', err)
        }
    }

    return (
        <section className="board-menu-modal">
            {!isFolderOpen && (
                <>
                    <div className="folder" onClick={() => setIsFolderOpen(true)}>
                        <Icon name='folder' style='fa-regular'/>
                        <span>{t('board.changeFolder')}</span>
                    </div>
                    <div className="duplicate" onClick={onDuplicateBoard}>
                        <Icon name='clone' style='fa-regular'/>
                        <span>{t('board.duplicate')}</span>
                    </div>
                    <div className="delete" onClick={onRemoveBoard}>
                        <Icon name='trash-can' style='fa-regular'/>
                        <span>{t('common.delete')}</span>
                    </div>
                </>
            )}

            {isFolderOpen && (
                <form onSubmit={onSaveFolder} className="folder-form">
                    <label className="folder-form-label">{t('board.folderLabel')}</label>
                    <input autoFocus value={folder} placeholder={t('board.folderHint')} onChange={e => setFolder(e.target.value)} className="folder-form-input"/>
                    <div className="folder-form-actions">
                        <button type="submit" className="folder-form-save">{t('common.save')}</button>
                        <button type="button" onClick={close} className="folder-form-cancel">{t('common.cancel')}</button>
                    </div>
                </form>
            )}
        </section>
    )
}
