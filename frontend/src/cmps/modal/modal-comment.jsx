import { Icon } from '../icon'
import {confirmDelete} from '../confirm-dialog'
import {t} from '../../i18n'

export function CommentMenuModal({commentId, onRemoveComment, onOpenEdit, setIsMenuModalOpen, taskId, isReply = false}){

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

    return (
        <section className="comment-modal">
            <div className="pin">
                <Icon name='thumbtack'/>
                <span>{t('common.pin')}</span>
            </div>
            <div className="edit" onClick={onEdit}>
                <Icon name='pen'/>
                <span>{t('common.edit')}</span>
            </div>
            <div className="delete" onClick={() => onRemove(commentId, taskId)}>
                <Icon name='trash-can' style='fa-regular'/>
                <span>{isReply?t('update.deleteReply'):t('update.delete')}</span>
            </div>
        </section>
    )
}