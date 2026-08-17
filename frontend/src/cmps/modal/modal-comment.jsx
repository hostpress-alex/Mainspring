import { Icon } from '../icon'
import {confirmDelete} from '../confirm-dialog'
import {t} from '../../i18n'

export function CommentMenuModal({
    commentId,
    onRemoveComment,
    onOpenEdit,
    setIsMenuModalOpen,
    taskId,
    isReply = false,
    isPinned = false,
    onTogglePin = null
}){

    async function onRemove(commentId){
        setIsMenuModalOpen(false)
        const ok = await confirmDelete({
            what: isReply?t('update.thisReply'):t('update.thisUpdate'),
            note: isReply?null:t('update.deleteNote'),
            button: isReply?t('update.deleteReply'):t('update.delete')
        })
        if(!ok) return
        onRemoveComment(commentId, taskId)
    }

    function onEdit(){
        setIsMenuModalOpen(false)
        onOpenEdit(true)
    }

    function onPin(){
        setIsMenuModalOpen(false)
        onTogglePin()
    }

    return (
        <section className="comment-modal">
            {/* Only shown when there is something to do: a reply cannot be
                pinned — it hangs off its update and would have to leave it —
                and a viewer may not pin at all. The host decides both by
                passing a handler or not. */}
            {onTogglePin && !isReply &&
                <div className="pin" onClick={onPin}>
                    <Icon name='thumbtack'/>
                    <span>{isPinned?t('common.unpin'):t('common.pin')}</span>
                </div>}
            <div className="edit" onClick={onEdit}>
                <Icon name='pen'/>
                <span>{t('common.edit')}</span>
            </div>
            <div className="delete" onClick={() => onRemove(commentId, taskId)}>
                <Icon name='trash-can' variant='fa-regular'/>
                <span>{isReply?t('update.deleteReply'):t('update.delete')}</span>
            </div>
        </section>
    )
}