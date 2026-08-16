import {useState} from 'react'

import { Icon } from '../icon'
import {CommentMenuModal} from '../modal/modal-comment'
import {utilService} from '../../services/util.service'
import { Avatar } from '../avatar'
import {AttachmentStrip} from './attachment-strip'
import {MentionTextarea} from '../mention/mention-textarea'
import {MentionText} from '../mention/mention-text'
import {toStorage} from '../../services/mention'
import './comment-replies.css'
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
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [editComment, setEditComment] = useState({...comment})
    const [isReplyOpen, setIsReplyOpen] = useState(false)
    const [replyTxt, setReplyTxt] = useState('')
    const [isSendingReply, setIsSendingReply] = useState(false)

    function handleChange({target}){
        let {value, name: field} = target
        setEditComment((prevComment) => ({...prevComment, [field]: value}))
    }

    function onCancelEdit(){
        setEditComment({...comment})
        setIsEditOpen(false)
    }

    function onSaveEdit(){
        onEditComment({...editComment, txt: toStorage(editComment.txt, members)}, taskId)
        setIsEditOpen(false)
    }

    async function onSendReply(ev){
        ev.preventDefault()
        if(!replyTxt.trim() || isSendingReply) return
        setIsSendingReply(true)
        try {
            await onReply(comment.id, toStorage(replyTxt, members))
            setReplyTxt('')
            setIsReplyOpen(false)
        } finally {
            setIsSendingReply(false)
        }
    }

    function onChangeTextStyle(ev, styleKey, align){
        ev.preventDefault()
        const style = {...editComment.style}
        switch(styleKey) {
            case 'fontStyle':
                style.fontStyle = style.fontStyle === 'normal'?'italic':'normal'
                break;
            case 'fontWeight':
                style.fontWeight = style[styleKey] === 'normal'?'bold':'normal'
                break;
            case 'textDecoration':
                style[styleKey] = style[styleKey] === 'none'?'underline':'none'
                break;
            case 'textAlign':
                style[styleKey] = align
                break;
            default:
                return
        }
        setEditComment((prevComment) => ({...prevComment, style}))
    }

    return (
        <section className={`comment-preview${isReply?' is-reply':''}`}>
            <div className="header-comment flex space-between">
                <div className="left flex align-center">
                    <Avatar src={comment.byMember?.imgUrl} alt=""/>
                    <span>{comment.byMember?.fullname}</span>
                </div>
                <div className="right flex align-center">
                    <div className="time flex align-center">
                        <Icon name='clock' style='fa-regular'/>
                        <span>{utilService.calculateTime(comment.archivedAt)}</span>
                    </div>
                    <div className={`menu-icon-container ${isMenuModalOpen?' active':''}`}>
                        <Icon name='ellipsis' onClick={() => setIsMenuModalOpen(!isMenuModalOpen)}/>
                        {isMenuModalOpen &&
                            <CommentMenuModal onRemoveComment={onRemoveComment} commentId={comment.id} onOpenEdit={setIsEditOpen} setIsMenuModalOpen={setIsMenuModalOpen} taskId={taskId} isReply={isReply}/>}
                    </div>
                </div>
            </div>
            {!isEditOpen && <>
                {comment.txt && <MentionText text={comment.txt} members={members} style={comment.style}/>}
                <AttachmentStrip attachments={comment.attachments}/>
            </>}
            {isEditOpen && <form className="input-container">
                <div className="style-txt">
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'fontWeight')}><Icon name='bold'/></span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'textDecoration')}><Icon name='underline'/></span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'fontStyle')}>/</span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'textAlign', 'Left')}><Icon name='align-left'/></span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'textAlign', 'Center')}><Icon name='align-center'/></span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'textAlign', 'Right')}><Icon name='align-right'/></span>
                </div>
                <MentionTextarea name="txt" members={members} style={editComment.style} value={editComment.txt} onChange={handleChange}/>
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
                            <MentionTextarea autoFocus rows={2} members={members} value={replyTxt} placeholder={t('update.replyPlaceholder')} onChange={ev => setReplyTxt(ev.target.value)} onKeyDown={ev => {
                                // Enter sends, Shift+Enter starts a new line.
                                if(ev.key === 'Enter' && !ev.shiftKey) onSendReply(ev)
                                if(ev.key === 'Escape'){
                                    setIsReplyOpen(false);
                                    setReplyTxt('')
                                }
                            }}/>
                            <div className="reply-actions">
                                <button type="submit" className="save" disabled={!replyTxt.trim() || isSendingReply}>
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
