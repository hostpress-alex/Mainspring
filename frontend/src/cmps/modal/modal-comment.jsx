import { BsPinAngle } from 'react-icons/bs'
import { AiOutlineDelete } from 'react-icons/ai'
import { FiEdit2 } from 'react-icons/fi'
import { confirmDelete } from '../confirm-dialog'

export function CommentMenuModal({ commentId, onRemoveComment, onOpenEdit, setIsMenuModalOpen, taskId, isReply = false }) {

    async function onRemove(commentId) {
        setIsMenuModalOpen(false)
        const ok = await confirmDelete({
            was: isReply ? 'Diese Antwort' : 'Dieses Update',
            hinweis: isReply ? null : 'Die Antworten darauf verschwinden mit.',
            knopf: isReply ? 'Antwort löschen' : 'Update löschen',
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
                <span>Anheften</span>
            </div>
            <div className="edit" onClick={onEdit}>
                <FiEdit2 />
                <span>Bearbeiten</span>
            </div>
            <div className="delete" onClick={() => onRemove(commentId, taskId)}>
                <AiOutlineDelete />
                <span>{isReply ? 'Antwort löschen' : 'Update löschen'}</span>
            </div>
        </section>
    )
}