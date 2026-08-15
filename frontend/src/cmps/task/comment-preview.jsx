import { useState } from "react"

import { IoTimeOutline } from 'react-icons/io5'
import { BiDotsHorizontalRounded } from 'react-icons/bi'
import { AiOutlineBold } from 'react-icons/ai'
import { RxUnderline } from 'react-icons/rx'
import { TbAlignRight, TbAlignCenter, TbAlignLeft } from 'react-icons/tb'
import { BsReply } from 'react-icons/bs'

import { CommentMenuModal } from "../modal/modal-comment"
import { utilService } from "../../services/util.service"
import { GUEST_IMG } from '../../services/avatar'
import { AttachmentStrip } from './attachment-strip'
import './comment-replies.css'

/**
 * Ein Update mit seinen Antworten.
 *
 * Antworten sind normale Kommentare mit `parentId`. Bewusst nur eine Ebene:
 * eine Antwort kann nicht selbst beantwortet werden — verschachtelte Baeume
 * liest hinterher niemand mehr.
 */
export function CommentPreview({ onRemoveComment, comment, taskId, onEditComment, replies = [], onReply, isReply = false }) {
    const [isMenuModalOpen, setIsMenuModalOpen] = useState(false)
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [editComment, setEditComment] = useState({ ...comment })
    const [isReplyOpen, setIsReplyOpen] = useState(false)
    const [replyTxt, setReplyTxt] = useState('')
    const [isSendingReply, setIsSendingReply] = useState(false)

    function handleChange({ target }) {
        let { value, name: field } = target
        setEditComment((prevComment) => ({ ...prevComment, [field]: value }))
    }

    function onCancelEdit() {
        setEditComment({ ...comment })
        setIsEditOpen(false)
    }

    function onSaveEdit() {
        onEditComment(editComment, taskId)
        setIsEditOpen(false)
    }

    async function onSendReply(ev) {
        ev.preventDefault()
        if (!replyTxt.trim() || isSendingReply) return
        setIsSendingReply(true)
        try {
            await onReply(comment.id, replyTxt)
            setReplyTxt('')
            setIsReplyOpen(false)
        } finally {
            setIsSendingReply(false)
        }
    }

    function onChangeTextStyle(ev, styleKey, align) {
        ev.preventDefault()
        const style = { ...editComment.style }
        switch (styleKey) {
            case 'fontStyle':
                style.fontStyle = style.fontStyle === 'normal' ? 'italic' : 'normal'
                break;
            case 'fontWeight':
                style.fontWeight = style[styleKey] === 'normal' ? 'bold' : 'normal'
                break;
            case 'textDecoration':
                style[styleKey] = style[styleKey] === 'none' ? 'underline' : 'none'
                break;
            case 'textAlign':
                style[styleKey] = align
                break;
            default: return
        }
        setEditComment((prevComment) => ({ ...prevComment, style }))
    }

    return (
        <section className={`comment-preview${isReply ? ' is-reply' : ''}`}>
            <div className="header-comment flex space-between">
                <div className="left flex align-center">
                    <img src={comment.byMember?.imgUrl || GUEST_IMG} alt="" />
                    <span>{comment.byMember?.fullname}</span>
                </div>
                <div className="right flex align-center">
                    <div className="time flex align-center">
                        <IoTimeOutline />
                        <span>{utilService.calculateTime(comment.archivedAt)}</span>
                    </div>
                    <div className={`menu-icon-container ${isMenuModalOpen ? ' active' : ''}`}>
                        <BiDotsHorizontalRounded onClick={() => setIsMenuModalOpen(!isMenuModalOpen)} />
                        {isMenuModalOpen && <CommentMenuModal onRemoveComment={onRemoveComment} commentId={comment.id} onOpenEdit={setIsEditOpen} setIsMenuModalOpen={setIsMenuModalOpen} taskId={taskId} isReply={isReply} />}
                    </div>
                </div>
            </div>
            {!isEditOpen && <>
                {comment.txt && <p style={comment.style}>{comment.txt}</p>}
                <AttachmentStrip attachments={comment.attachments} />
            </>}
            {isEditOpen && <form className="input-container">
                <div className="style-txt">
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'fontWeight')}><AiOutlineBold /></span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'textDecoration')}><RxUnderline /></span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'fontStyle')}>/</span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'textAlign', 'Left')}><TbAlignLeft /></span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'textAlign', 'Center')}><TbAlignCenter /></span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'textAlign', 'Right')}><TbAlignRight /></span>
                </div>
                <textarea
                    name="txt"
                    style={editComment.style}
                    value={editComment.txt}
                    onChange={handleChange}></textarea>
            </form>}
            {isEditOpen && <div className="button-container">
                <button className="save" onMouseDown={onSaveEdit}>Speichern</button>
                <button className="cancel" onMouseDown={onCancelEdit}>Abbrechen</button>
            </div>}

            {!isReply && !isEditOpen && (
                <div className="comment-replies">
                    {replies.length > 0 && (
                        <ul className="reply-list">
                            {replies.map(reply => (
                                <li key={reply.id}>
                                    <CommentPreview
                                        comment={reply}
                                        taskId={taskId}
                                        isReply
                                        onRemoveComment={onRemoveComment}
                                        onEditComment={onEditComment} />
                                </li>
                            ))}
                        </ul>
                    )}

                    {!isReplyOpen && (
                        <button type="button" className="reply-btn" onClick={() => setIsReplyOpen(true)}>
                            <BsReply />
                            <span>{replies.length ? `Antworten (${replies.length})` : 'Antworten'}</span>
                        </button>
                    )}

                    {isReplyOpen && (
                        <form className="reply-form" onSubmit={onSendReply}>
                            <textarea
                                autoFocus
                                rows={2}
                                value={replyTxt}
                                placeholder="Antwort schreiben…"
                                onChange={ev => setReplyTxt(ev.target.value)}
                                onKeyDown={ev => {
                                    // Enter sendet, Shift+Enter macht eine neue Zeile.
                                    if (ev.key === 'Enter' && !ev.shiftKey) onSendReply(ev)
                                    if (ev.key === 'Escape') { setIsReplyOpen(false); setReplyTxt('') }
                                }} />
                            <div className="reply-actions">
                                <button type="submit" className="save" disabled={!replyTxt.trim() || isSendingReply}>
                                    {isSendingReply ? 'Sendet…' : 'Antworten'}
                                </button>
                                <button type="button" className="cancel"
                                    onClick={() => { setIsReplyOpen(false); setReplyTxt('') }}>Abbrechen</button>
                            </div>
                        </form>
                    )}
                </div>
            )}
        </section>
    )
}
