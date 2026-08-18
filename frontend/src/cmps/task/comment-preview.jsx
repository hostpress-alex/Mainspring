import {useState} from 'react'
import {useSelector} from 'react-redux'

import { Icon } from '../icon'
import {CommentMenuModal} from '../modal/modal-comment'
import {Tooltip} from '@mui/material'
import {formatRelative, formatExact} from '../../services/date.util'
import { Avatar } from '../avatar'
import {AttachmentStrip} from './attachment-strip'
import {CommentReactions} from './comment-reactions'
import {useTaskReactions} from './use-task-reactions'
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
    const [isThreadOpen, setIsThreadOpen] = useState(false)

    // Shared across the whole thread — one request for the task, not one per
    // comment. A viewer may react: an emoji says less than the reply they are
    // already allowed to write.
    const {reactions, toggle: onToggleReaction} = useTaskReactions(board?._id, taskId)
    const canReact = Boolean(me) && boardRoles.canView(board, me)

    // Oldest first in the list, so the ones that fold are the ones at the top.
    const foldFrom = isThreadOpen?0:Math.max(0, replies.length - VISIBLE_REPLIES)
    const hiddenReplies = replies.slice(0, foldFrom)
    const shownReplies = replies.slice(foldFrom)
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
            {/* Author, then when, on one line. Who wrote it is the first
                thing anybody looks for in a thread, so it reads before the
                text rather than beside it in grey. */}
            <div className="comment-head">
                <Avatar src={comment.byMember?.imgUrl} className="comment-avatar"/>
                <span className="comment-author">{comment.byMember?.fullname || t('update.someone')}</span>
                <Tooltip title={formatExact(comment.archivedAt)} arrow placement="top">
                    <time className="comment-when" dateTime={new Date(comment.archivedAt || 0).toISOString()}>
                        {formatRelative(comment.archivedAt)}
                    </time>
                </Tooltip>
                {/* Said in the list itself, not only in the menu: an update at
                    the top for no visible reason looks like a sorting bug. */}
                {isPinned && <span className="pinned-badge">
                    <Icon name='thumbtack'/>
                    <span>{t('update.pinned')}</span>
                </span>}
                {/* Edit and delete. A viewer sees it on their own comment and
                    on nobody else's — the server says the same. */}
                <div ref={menuRef} className={`comment-tools menu-icon-container${isMenuModalOpen?' active':''}`}>
                    {canWriteThis && <Icon name='ellipsis' onClick={() => setIsMenuModalOpen(!isMenuModalOpen)}/>}
                    {isMenuModalOpen &&
                        <CommentMenuModal onRemoveComment={onRemoveComment} commentId={comment.id} onOpenEdit={setIsEditOpen} setIsMenuModalOpen={setIsMenuModalOpen} taskId={taskId} isReply={isReply} isPinned={isPinned} onTogglePin={canPin?onTogglePin:null}/>}
                </div>
            </div>
            {!isEditOpen && <div className="comment-body">
                {/* No `style` any more: it carried the whole-comment
                    formatting that this round replaced. Old comments still
                    hold it in the database and it is simply not read. */}
                <RichTextView value={comment.txt}/>
                <AttachmentStrip attachments={comment.attachments}/>
            </div>}
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

            {/* One row for everything you can do with this comment, and it sits
                directly under the text — above the thread, so answering a long
                discussion does not mean scrolling past all of it first. */}
            {!isEditOpen && (
                <div className="comment-actions">
                    <CommentReactions
                        reactions={reactions[comment.id] || {}}
                        people={board?.members || members}
                        canReact={canReact}
                        onToggle={emoji => onToggleReaction(comment.id, emoji)}/>
                    {!isReply && !isReplyOpen && (
                        <button type="button" className="reply-btn" onClick={() => setIsReplyOpen(true)}>
                            <Icon name='reply'/>
                            <span>{t('update.replies')}</span>
                        </button>
                    )}
                </div>
            )}

            {/* Only when it holds something: an empty band under every update
                is a grey stripe that means nothing. */}
            {!isReply && !isEditOpen && (isReplyOpen || replies.length > 0) && (
                <div className="comment-replies">

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
                                    {isSendingReply?t('update.sending'):t('update.replies')}
                                </button>
                                <button type="button" className="cancel" onClick={() => {
                                    setIsReplyOpen(false);
                                    setReplyTxt('')
                                }}>{t('common.cancel')}</button>
                            </div>
                        </form>
                    )}

                    {/* Only the last few, unless somebody asks for the rest.
                        A thread of twenty answers pushes the next update off
                        the screen, and the ones that matter are the recent
                        ones — which is why the older ones fold and not the
                        newer ones. */}
                    {hiddenReplies.length > 0 && !isThreadOpen && (
                        <button type="button" className="reply-more" onClick={() => setIsThreadOpen(true)}>
                            <span className="reply-more-faces">
                                {facesOf(hiddenReplies).map(person => (
                                    <Avatar key={person._id} src={person.imgUrl} title={person.fullname}/>
                                ))}
                            </span>
                            <span>{t('update.previousReplies', {n: hiddenReplies.length})}</span>
                        </button>
                    )}

                    {shownReplies.length > 0 && (
                        <ul className="reply-list">
                            {shownReplies.map(reply => (
                                <li key={reply.id}>
                                    <CommentPreview comment={reply} taskId={taskId} isReply onRemoveComment={onRemoveComment} onEditComment={onEditComment} members={members}/>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </section>
    )
}

/**
 * How many replies stay in view before the rest fold away.
 *
 * Three rather than all of them: the answer that matters is almost always the
 * last one, and a thread that grows without bound buries the next update.
 */
const VISIBLE_REPLIES = 3

/**
 * Up to three distinct people out of the folded replies.
 *
 * Faces say more about whether a thread is worth opening than a number does —
 * "three colleagues talked about this" is a different message from "one person
 * wrote seven times".
 */
function facesOf(replies){
    const seen = new Map()
    for(const reply of replies){
        const person = reply?.byMember
        const id = person?._id?String(person._id):''
        if(!id || seen.has(id)) continue
        seen.set(id, {_id: id, imgUrl: person.imgUrl, fullname: person.fullname || ''})
        if(seen.size === 3) break
    }
    return [...seen.values()]
}
