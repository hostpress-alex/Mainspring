import { BsPinAngle } from 'react-icons/bs'
import { AiOutlineDelete } from 'react-icons/ai'
import { FiEdit2 } from 'react-icons/fi'
import { confirmDelete } from '../confirm-dialog'
import { t } from '../../i18n'

export function CommentMenuModal({ commentId, onRemoveComment, onOpenEdit, setIsMenuModalOpen, taskId, isReply = false }) {

    async function onRemove(commentId) {
        setIsMenuModalOpen(false)
        const ok = await confirmDelete({
            what: isReply ? t('update.thisReply') : t('update.thisUpdate'),
            note: isReply ? null : t('update.deleteNote'),
            button: isReply ? t('update.deleteReply') : t('update.delete'),
        })
        if (!ok) return
        onRemoveComment(commentId, taskId)
    }   

    function onEdit() {
        setIsMenuModalOpen(false)
        onOpenEdit(true)
    }   
    return (
        <section className="comment-modal">
            <div className="pin">
                <BsPinAngle />
                <span>{t('common.pin')}</span>
            </div>
            <div className="edit" onClick={onEdit}>
                <FiEdit2 />
                <span>{t('common.edit')}</span>
            </div>
            <div className="delete" onClick={() => onRemove(commentId, taskId)}>
                <AiOutlineDelete />
                <span>{isReply ? t('update.deleteReply') : t('update.delete')}</span>
            </div>
        </section>
    )
}