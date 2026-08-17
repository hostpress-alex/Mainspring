import {useState} from 'react'
import {useSelector} from 'react-redux'

import { Icon } from '../icon'
import {CommentMenuModal} from '../modal/modal-comment'
import {utilService} from '../../services/util.service'
import { Avatar } from '../avatar'
import {AttachmentStrip} from './attachment-strip'
import {RichTextEditor} from '../rich-text/rich-text-editor'
import {RichTextView} from '../rich-text/rich-text-view'
import {isEmpty as isRichEmpty} from '../../services/rich-text'
import {useDismissable} from '../../customHooks/useDismissable'
import * as boardRoles from '../../services/board-roles'
import {t} from '../../i18n'

/**
 * One update with its replies.
 *
 * Replies are ordinary comments with a `parentId`. Deliberately only one
 * level: a reply cannot be replied to — nobody reads nested trees later on.
 */
export function CommentPreview({
    onRemoveComment,
    comment,
    taskId,
    onEditComment,
    replies = [],
    onReply,
    isReply = false,
    members = []
}){
    const [isMenuModalOpen, setIsMenuModalOpen] = useState(false)
    // Around the button as well as the menu — see useDismissable.
    const menuRef = useDismissable(isMenuModalOpen, () => setIsMenuModalOpen(false))
    const [isEditOpen, setIsEditOpen] = useState(false)
    const board = useSelector(storeState => storeState.boardModule.filteredBoard)
    const me = useSelector(storeState => storeState.userModule.user)
    const canWriteThis = boardRoles.canWriteComment(board, me, comment)
    // Pinning decides what everybody reads first, so it is not an edit of your
    // own text — an editor may, a viewer may not, and the server says the same.
    const canPin = !isReply && boardRoles.canEdit(board, me)
    const isPinned = Boolean(comment.pinnedAt)
    const [editComment, setEditComment] = useState({...comment})
    const [isReplyOpen, setIsReplyOpen] = useState(false)
    const [replyTxt, setReplyTxt] = useState('')
    const [isSendingReply, setIsSendingReply] = useState(false)

    function onCancelEdit(){
        setEditComment({...comment})
        setIsEditOpen(false)
    }

    function onSaveEdit(){
        onEditComment({...editComment}, taskId)
        setIsEditOpen(false)
    }

    /** Pin or unpin. The moment is stored, so several pins keep an order. */
    function onTogglePin(){
        onEditComment({...comment, pinnedAt: isPinned?null:Date.now()}, taskId)
    }

    async function onSendReply(ev){
        // Called both from the form's submit and from Ctrl+Enter inside the
        // editor, which has no event to hand over.
        ev?.preventDefault?.()
        if(isRichEmpty(replyTxt) || isSendingReply) return
        setIsSendingReply(true)
        try {
            await onReply(comment.id, replyTxt)
            setReplyTxt('')
            setIsReplyOpen(false)
        } finally {
            setIsSendingReply(false)
        }
    }


    return (
        <section className={`comment-preview${isReply?' is-reply':''}${isPinned?' is-pinned':''}`}>
            <div className="header-comment flex space-between">
                <div className="left flex align-center">
                    <Avatar src={comment.byMember?.imgUrl} alt=""/>
                    <span>{comment.byMember?.fullname}</span>
                    {/* Said in the list itself, not only in the menu: an
                        update at the top for no visible reason looks like a
                        sorting bug. */}
                    {isPinned && <span className="pinned-badge">
                        <Icon name='thumbtack'/>
                        <span>{t('update.pinned')}</span>
                    </span>}
                </div>
                <div className="right flex align-center">
                    <div className="time flex align-center">
                        <Icon name='clock' variant='fa-regular'/>
                        <span>{utilService.calculateTime(comment.archivedAt)}</span>
                    </div>
                    {/* Edit and delete. A viewer sees it on their own comment
                        and on nobody else's — the server says the same. */}
                    <div ref={menuRef} className={`menu-icon-container ${isMenuModalOpen?' active':''}`}>
                        {canWriteThis && <Icon name='ellipsis' onClick={() => setIsMenuModalOpen(!isMenuModalOpen)}/>}
                        {isMenuModalOpen &&
                            <CommentMenuModal onRemoveComment={onRemoveComment} commentId={comment.id} onOpenEdit={setIsEditOpen} setIsMenuModalOpen={setIsMenuModalOpen} taskId={taskId} isReply={isReply} isPinned={isPinned} onTogglePin={canPin?onTogglePin:null}/>}
                    </div>
                </div>
            </div>
            {!isEditOpen && <>
                {/* No `style` any more: it carried the whole-comment
                    formatting that this round replaced. Old comments still
                    hold it in the database and it is simply not read. */}
                <RichTextView value={comment.txt}/>
                <AttachmentStrip attachments={comment.attachments}/>
            </>}
            {isEditOpen && <form className="input-container">
                <RichTextEditor
                    value={editComment.txt}
                    members={members}
                    autoFocus
                    onChange={txt => setEditComment(prev => ({...prev, txt}))}
                    onSubmit={onSaveEdit}
                />
            </form>}
            {isEditOpen && <div className="button-container">
                <button className="save" onMouseDown={onSaveEdit}>{t('common.save')}</button>
                <button className="cancel" onMouseDown={onCancelEdit}>{t('common.cancel')}</button>
            </div>}

            {!isReply && !isEditOpen && (
                <div className="comment-replies">
                    {replies.length > 0 && (
                        <ul className="reply-list">
                            {replies.map(reply => (
                                <li key={reply.id}>
                                    <CommentPreview comment={reply} taskId={taskId} isReply onRemoveComment={onRemoveComment} onEditComment={onEditComment} members={members}/>
                                </li>
                            ))}
                        </ul>
                    )}

                    {!isReplyOpen && (
                        <button type="button" className="reply-btn" onClick={() => setIsReplyOpen(true)}>
                            <Icon name='reply'/>
                            <span>{replies.length?t('update.repliesCount', {n: replies.length}):t('update.replies')}</span>
                        </button>
                    )}

                    {isReplyOpen && (
                        <form className="reply-form" onSubmit={onSendReply}>
                            {/* Ctrl+Enter sends rather than Enter: a reply can
                                have paragraphs and a list now, so Enter has to
                                mean "new line". */}
                            <RichTextEditor
                                value={replyTxt}
                                members={members}
                                placeholder={t('update.replyPlaceholder')}
                                autoFocus
                                onChange={setReplyTxt}
                                onSubmit={() => onSendReply()}
                            />
                            <div className="reply-actions">
                                <button type="submit" className="save" disabled={isRichEmpty(replyTxt) || isSendingReply}>
                                    {isSendingReply?'Sendet…':t('update.replies')}
                                </button>
                                <button type="button" className="cancel" onClick={() => {
                                    setIsReplyOpen(false);
                                    setReplyTxt('')
                                }}>{t('common.cancel')}</button>
                            </div>
                        </form>
                    )}
                </div>
            )}
        </section>
    )
}
