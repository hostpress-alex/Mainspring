import {useEffect, useMemo, useRef, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useSelector} from 'react-redux'

import {toggleModal, updateTaskAction} from '../../store/board.actions'

import { Icon } from '../icon'
import {boardService} from '../../services/board.service'
import {singleLineEditable} from '../../services/editable'
import {utilService} from '../../services/util.service'
import {CommentPreview} from '../task/comment-preview'
import {ActivityPreview} from '../activity-preview'
import {TimePanel} from '../time/time-panel'
import {TaskTimerControls} from '../time/task-timer'
import {useBoardTotals} from '../time/use-board-totals'
import {ErrorBoundary} from '../error-boundary'
import {
    socketService,
    SOCKET_EMIT_SEND_MSG,
    SOCKET_EMIT_SET_TOPIC,
    SOCKET_EVENT_ADD_MSG
} from '../../services/socket.service'
import noUpdate from '../../assets/img/empty-update.png'
import {uploadFile} from '../../services/upload.service'
import {AttachmentStrip} from '../task/attachment-strip'
import {RichTextEditor} from '../rich-text/rich-text-editor'
import {isEmpty as isRichEmpty, toPlainText} from '../../services/rich-text'
import * as boardRoles from '../../services/board-roles'
import {t} from '../../i18n'

export function TaskModal({task, board, groupId, setModalCurrTask, onClose = null}){
    const user = useSelector(storeState => storeState.userModule.user)
    const [comment, setComment] = useState(boardService.getEmptyComment())
    const [isWriteNewUpdate, setIsWriteNewUpdate] = useState(false)
    /**
     * Which of the three panels is open.
     *
     * This was a boolean while there were two, and the third one is exactly
     * why it is not any more: `!isShowUpdate` meant "activity", which stops
     * being true the moment there is somewhere else to be. The two old flags
     * are derived below so the rest of this file did not have to change.
     */
    const timeTotals = useBoardTotals(board?._id)
    const [tab, setTab] = useState('updates')
    const isShowUpdate = tab === 'updates'
    const isShowActivity = tab === 'activity'
    const [currTask, setCurrTask] = useState(task)
    const [isUploading, setIsUploading] = useState(false)
    const [uploadErr, setUploadErr] = useState(null)
    const navigate = useNavigate()

    // When switching to another task the local state has to follow —
    // otherwise the dialog keeps showing the previous task.
    useEffect(() => {
        setCurrTask(task)
        setComment(boardService.getEmptyComment())
        setIsWriteNewUpdate(false)
    }, [task])


    /**
     * Derived, not stored.
     *
     * This used to be state filled once when the dialog opened, so anything
     * that happened afterwards — including the update you had just written —
     * only appeared after a reload. There is nothing here that the board does
     * not already know; keeping a second copy of it was the whole bug.
     *
     * 'check' was the marking for multi-select and is no longer produced. Old
     * entries are hidden here and rotate out on their own (40 per board).
     */
    const taskActivities = useMemo(
        () => (board.activities || [])
            .filter(activity => activity && activity.task && activity.task.id === task.id)
            .filter(activity => activity.action !== 'check'),
        [board.activities, task.id])

    useEffect(() => {
        socketService.emit(SOCKET_EMIT_SET_TOPIC, task.id)
        socketService.on(SOCKET_EVENT_ADD_MSG, addComment)

        return () => {
            socketService.off(SOCKET_EVENT_ADD_MSG, addComment)
        }
    }, [task.id])

    /**
     * A comment from another browser (socket). Deliberately with new objects
     * rather than unshift: currTask is the same object as in the store, and
     * changing it in place makes the comparison on save blind.
     */
    function addComment(comment){
        setCurrTask(prev => ({...prev, comments: [comment, ...(prev.comments || [])]}))
    }

    /**
     * Updates and their replies. Replies are comments with a parentId; they
     * appear in chronological order under their update, while the updates
     * themselves are newest first.
     */
    const threads = useMemo(() => {
        const all = currTask.comments || []
        const byParent = new Map()
        for(const c of all){
            if(!c || !c.parentId) continue
            if(!byParent.has(c.parentId)) byParent.set(c.parentId, [])
            byParent.get(c.parentId).push(c)
        }
        for(const list of byParent.values()){
            list.sort((a, b) => (a.archivedAt || 0) - (b.archivedAt || 0))
        }
        // Pinned updates first, most recently pinned at the very top; the rest
        // keep the order they came in, which is newest first. Array.sort is
        // stable, so comparing only the pin does not shuffle the others.
        const updates = all.filter(c => c && !c.parentId)
        updates.sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0))
        return updates.map(c => ({comment: c, replies: byParent.get(c.id) || []}))
    }, [currTask.comments])

    async function onAddReply(parentId, txt){
        const clean = String(txt || '').trim()
        if(!clean) return
        const reply = boardService.getEmptyComment()
        reply.id = utilService.makeId()
        reply.parentId = parentId
        reply.txt = clean
        reply.archivedAt = Date.now()
        if(user){
            reply.byMember = {_id: user._id, fullname: user.fullname, imgUrl: user.imgUrl || ''}
        }
        const next = {...currTask, comments: [reply, ...(currTask.comments || [])]}
        await updateTaskAction(board, groupId, next, updateActivity('reply', clean))
        setCurrTask(next)
    }


    /**
     * Closing means "back to what was behind this", and what that is depends
     * on who opened it. The board's own panel drops the task off the address
     * and leaves you on the board; opened over the calendar or the search, the
     * caller passes what to do instead — otherwise closing a task you opened
     * from the calendar would land you on a board you never asked to see.
     */
    function onCloseModal(){
        if(onClose) onClose()
        else navigate(`/board/${board._id}`)
        setComment(boardService.getEmptyComment())
    }

    async function onUpdateTaskTitle(ev){
        const value = ev.target.innerText
        if(value === currTask.title) return
        const next = {...currTask, title: value}
        const activity = boardService.getEmptyActivity()
        activity.action = 'title'
        activity.task = {id: currTask.id, title: value}
        activity.from = currTask.title
        activity.to = value
        try {
            await updateTaskAction(board, groupId, next, activity)
            setCurrTask(next)
        } catch(err) {
            console.log('saving failed')
        }
    }

    /**
     * The first line of an update, for the history.
     *
     * The log is a list of short lines capped at forty entries per board — a
     * whole update with its formatting does not belong in it, and "somebody
     * wrote something" without a hint of what is a line nobody can use. So: the
     * text, flattened, cut off.
     */
    function excerptOf(txt){
        const plain = toPlainText(txt || '').replace(/\s+/g, ' ').trim()
        return plain.length > 80?plain.slice(0, 79) + '…':plain
    }

    /** An entry for something that happened to the updates of this task. */
    function updateActivity(action, txt){
        const activity = boardService.getEmptyActivity()
        activity.action = action
        activity.task = {id: currTask.id, title: currTask.title}
        activity.from = null
        activity.to = excerptOf(txt)
        return activity
    }

    async function onAddComment(){
        if(isUploading) return
        if(isRichEmpty(comment.txt) && !(comment.attachments || []).length) return
        try {
            comment.id = utilService.makeId()
            // No conversion step any more. The editor writes a mention as a
            // node with the id already in it, so there is no "shown form" that
            // has to be matched against the member list at the last moment —
            // and with it goes the case of two members with the same name.
            // The whole person, id included. Setting only the name and the
            // picture left `_id: null` from getEmptyComment in the row, so the
            // update looked right for as long as this tab stayed open and
            // turned into "Unbekannt" the moment it was read back from the
            // server — which nothing did until ticking a checklist started
            // re-reading it.
            if(user) comment.byMember = {_id: user._id, fullname: user.fullname, imgUrl: user.imgUrl || ''}
            const next = {...currTask, comments: [comment, ...(currTask.comments || [])]}
            socketService.emit(SOCKET_EMIT_SEND_MSG, comment)
            await updateTaskAction(board, groupId, next, updateActivity('update', comment.txt))
            setIsWriteNewUpdate(false)
            setCurrTask(next)
            setComment(boardService.getEmptyComment())
        } catch(err) {
            console.log('err:', err)
        }
    }

    /**
     * The draft may only be discarded when the focus really leaves the form.
     * Before this, a click on a button inside the form (attaching a file, say)
     * deleted the half-finished update.
     */
    function close(ev){
        const next = ev.relatedTarget
        if(next && ev.currentTarget.closest('.update')?.contains(next)) return
        if(isUploading || comment.txt || (comment.attachments || []).length) return
        setIsWriteNewUpdate(false)
        setUploadErr(null)
        setComment(boardService.getEmptyComment())
    }

    function onDiscard(ev){
        ev.preventDefault()
        setIsWriteNewUpdate(false)
        setUploadErr(null)
        setComment(boardService.getEmptyComment())
    }

    /**
     * Store one file and hand it back.
     *
     * Only stores. Whether the result belongs in the text or under it is the
     * editor's decision — it knows where the cursor was, and it is the one
     * that can tell an image from a spreadsheet without this component
     * learning about MIME types.
     */
    async function onUploadFile(file){
        setUploadErr(null)
        setIsUploading(true)
        try {
            const saved = await uploadFile(file,
                {scope: 'task', taskId: currTask.id, boardId: board?._id, name: file.name})
            return {...saved, name: saved.name || file.name || t('file.file')}
        } catch(err) {
            setUploadErr(err.message || t('file.uploadFailed'))
            return null
        } finally {
            setIsUploading(false)
        }
    }

    /** Everything that is not an image is listed under the comment. */
    function onAttachFile(saved){
        setComment(prev => ({...prev, attachments: [...(prev.attachments || []), saved]}))
    }

    /** Ctrl+V in the update area: attach images from the clipboard. */


    function onRemoveAttachment(id){
        setComment(prev => ({...prev, attachments: (prev.attachments || []).filter(a => a._id !== id)}))
    }

    async function onRemoveComment(commentId){
        try {
            const removed = (currTask.comments || []).find(c => c.id === commentId)
            // Replies without their update would not be visible anywhere.
            const next = {
                ...currTask,
                comments: currTask.comments.filter(c => c.id !== commentId && c.parentId !== commentId)
            }
            await updateTaskAction(board, groupId, next,
                updateActivity(removed?.parentId?'replyDelete':'updateDelete', removed?.txt))
            setCurrTask(next)
        } catch(err) {
            console.log('err:', err)
        }
    }


    function handleChange({target}){
        let {value, name: field} = target
        setComment((prevComment) => ({...prevComment, [field]: value}))
    }

    /**
     * `note` lets the caller say what kind of change this was.
     *
     * Ticking a box changes the text of a comment, so without it the history
     * would call it a rewrite and print the whole update again. What somebody
     * reading the log wants to know is which item was ticked — see
     * onToggleTask in comment-preview.
     */
    async function onEditComment(saveComment, _taskId, note = null){
        try {
            const next = {...currTask, comments: currTask.comments.map(c => (c.id === saveComment.id)?saveComment:c)}
            // Pinning goes through here too, and "pinned" is not "rewritten" —
            // only a changed text is worth a line in the history.
            const before = (currTask.comments || []).find(c => c.id === saveComment.id)
            const changed = before && before.txt !== saveComment.txt
            const activity = note
                ?updateActivity(note.action, note.txt)
                :(changed?updateActivity(saveComment.parentId?'replyEdit':'updateEdit', saveComment.txt):undefined)
            await updateTaskAction(board, groupId, next, activity)
            setCurrTask(next)
        } catch(err) {
            console.log('err:', err)
        }
    }

    return <section className="task-modal">
        <div className="task-modal-header flex align-center">
            <Icon name='xmark' className="close-btn" onClick={onCloseModal}/>
            <div className="title">
                {/* Same rule as in the row behind it: a viewer reads the
                    task and writes only comments. */}
                <blockquote contentEditable={boardRoles.canEdit(board, user)} onBlur={onUpdateTaskTitle} suppressContentEditableWarning={true}
                            {...singleLineEditable()}>
                    {task.title}
                </blockquote>
            </div>
            {/* The timer belongs where the task's name is: start it and you
                can see what you started it on. */}
            {boardRoles.canEdit(board, user) &&
                <TaskTimerControls board={board} task={currTask} total={timeTotals[currTask.id] || 0}/>}
        </div>
        <div className="task-modal-type flex">
            <div onClick={() => setTab('updates')} className={`updates-btn ${isShowUpdate?'active':''}`}>
                {/* Was a house, inherited from the template. An update is a
                    message, not a home page. */}
                <Icon name='comment' variant='fa-regular'/>
                {/* The number belongs on the tab: how much is in there is the
                    reason to click it, and finding out by clicking is one
                    click too many. */}
                <span>{t('update.updates')}{threads.length?` · ${threads.length}`:''}</span>
            </div>
            <div onClick={() => setTab('activity')} className={`activity-btn ${isShowActivity?'active':''}`}>
                <span>{t('activity.activity')}</span>
            </div>
            <div onClick={() => setTab('time')} className={`time-btn ${tab === 'time'?'active':''}`}>
                <Icon name='stopwatch'/>
                <span>{t('time.times')}</span>
            </div>
        </div>
        {tab === 'time' && <ErrorBoundary label={t('time.times')}>
            <TimePanel board={board} task={currTask}/>
        </ErrorBoundary>}
        {isShowActivity && <ErrorBoundary label={t('activity.area')}>
            <ul className="activities">
                {
                    taskActivities.map((activity, idx) => {
                        return <li key={idx}><ActivityPreview activity={activity}/></li>
                    })
                }
            </ul>
        </ErrorBoundary>}
        {isShowUpdate && <section className="update">
            {/* A viewer may reply to an update but not start one — that is the
                rule, and a box they cannot post from would only be a trap. */}
            {!isWriteNewUpdate && boardRoles.canStartThread(board, user) &&
                <span className="close-input-container flex align-center" onClick={() => setIsWriteNewUpdate(true)}>{t('update.write')}</span>}
            {isWriteNewUpdate && <form className="input-container" onSubmit={ev => ev.preventDefault()}>
                {/* No paperclip. A file is dropped into the text or pasted.
                    An image lands where it was dropped; everything else is
                    listed under the comment as an attachment — a screenshot
                    belongs next to the sentence it explains, a spreadsheet
                    does not belong inside a paragraph. */}
                <RichTextEditor
                    value={comment.txt}
                    members={board.members}
                    placeholder={t('update.placeholder')}
                    autoFocus
                    onChange={txt => setComment(prev => ({...prev, txt}))}
                    onSubmit={() => onAddComment()}
                    onUpload={onUploadFile}
                    onAttach={onAttachFile}
                />

                <AttachmentStrip attachments={comment.attachments} onRemove={onRemoveAttachment}/>

                {isUploading && <p className="update-note">{t('update.uploading')}</p>}
                {uploadErr && <p className="update-note is-error">{uploadErr}</p>}
            </form>}
            {isWriteNewUpdate && <div className="button-container">
                <button className="save" onMouseDown={onAddComment} disabled={isUploading || (isRichEmpty(comment.txt) && !(comment.attachments || []).length)}>{t('update.update')}</button>
                <button className="cancel" onMouseDown={onDiscard}>{t('update.discard')}</button>
            </div>}
            <ErrorBoundary label={t('update.area')}>
                <ul className="comments-list">
                    {
                        threads.map(({comment, replies}) => {
                            return (
                                <li key={comment.id}>
                                    <CommentPreview taskId={currTask.id} onRemoveComment={onRemoveComment} comment={comment} replies={replies} onReply={onAddReply} onEditComment={onEditComment} members={board.members}/>
                                </li>
                            )
                        })
                    }
                </ul>
            </ErrorBoundary>
            {threads.length === 0 &&
                <div className="no-updates flex column align-center">
                    <img src={noUpdate} alt=""/>
                    <div className="txt flex column align-center">
                        <h2>{t('update.none')}</h2>
                        <p>{t('update.noneHint')}</p>
                    </div>
                </div>}
        </section>}
    </section>
}