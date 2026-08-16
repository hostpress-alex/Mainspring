import {useEffect, useMemo, useRef, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {useSelector} from 'react-redux'

import {toggleModal, updateTaskAction} from '../../store/board.actions'

import { Icon } from '../icon'
import {boardService} from '../../services/board.service'
import {singleLineEditable} from '../../services/editable'
import {utilService} from '../../services/util.service'
import {CommentPreview} from '../task/comment-preview'
import {MentionTextarea} from '../mention/mention-textarea'
import {toStorage} from '../../services/mention'
import {ActivityPreview} from '../activity-preview'
import {ErrorBoundary} from '../error-boundary'
import {
    socketService,
    SOCKET_EMIT_SEND_MSG,
    SOCKET_EMIT_SET_TOPIC,
    SOCKET_EVENT_ADD_MSG
} from '../../services/socket.service'
import noUpdate from '../../assets/img/empty-update.png'
import {uploadFile, imagesFromClipboard} from '../../services/upload.service'
import {AttachmentStrip} from '../task/attachment-strip'
import {t} from '../../i18n'

export function TaskModal({task, board, groupId, setModalCurrTask}){
    const user = useSelector(storeState => storeState.userModule.user)
    const [comment, setComment] = useState(boardService.getEmptyComment())
    const [isWriteNewUpdate, setIsWriteNewUpdate] = useState(false)
    const [taskActivities, setTaskActivities] = useState([])
    const [isShowUpdate, setIsShowUpdate] = useState(true)
    const [currTask, setCurrTask] = useState(task)
    const [isUploading, setIsUploading] = useState(false)
    const [uploadErr, setUploadErr] = useState(null)
    const elFileInput = useRef()
    const elTextarea = useRef()
    const navigate = useNavigate()

    // When switching to another task the local state has to follow —
    // otherwise the dialog keeps showing the previous task.
    useEffect(() => {
        setCurrTask(task)
        setComment(boardService.getEmptyComment())
        setIsWriteNewUpdate(false)
    }, [task])

    // Whoever clicks "Write an update" wants to write — not click into the
    // einmal ins Feld klicken muessen.
    useEffect(() => {
        if(isWriteNewUpdate) elTextarea.current?.focus()
    }, [isWriteNewUpdate])

    useEffect(() => {
        loadTaskActivity()
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
        return all.filter(c => c && !c.parentId).map(c => ({comment: c, replies: byParent.get(c.id) || []}))
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
        await updateTaskAction(board, groupId, next)
        setCurrTask(next)
    }

    function loadTaskActivity(){
        // 'check' was the marking for multi-select — it is no longer
        // produced. Old entries are hidden here and rotate out of the list
        // on their own over time (max. 40 entries per board).
        const taskActivities = (board.activities || []).filter(activity => activity && activity.task && activity.task.id === task.id).filter(activity => activity.action !== 'check')
        setTaskActivities(taskActivities)
    }

    function onCloseModal(){
        navigate(`/board/${board._id}`)
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

    async function onAddComment(){
        if(isUploading) return
        if(!comment.txt.trim() && !(comment.attachments || []).length) return
        try {
            comment.id = utilService.makeId()
            // Shown form -> stored form, at the last possible moment. Up to
            // here the text is what the user sees; from here it carries ids.
            comment.txt = toStorage(comment.txt, board.members)
            if(user){
                comment.byMember.fullname = user.fullname
                comment.byMember.imgUrl = user.imgUrl
            }
            const next = {...currTask, comments: [comment, ...(currTask.comments || [])]}
            socketService.emit(SOCKET_EMIT_SEND_MSG, comment)
            await updateTaskAction(board, groupId, next)
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

    async function addFiles(files){
        const list = Array.from(files || [])
        if(!list.length) return
        setUploadErr(null)
        setIsUploading(true)
        try {
            for(const file of list){
                const saved = await uploadFile(file, {scope: 'task', taskId: currTask.id, name: file.name})
                setComment(prev => ({
                    ...prev,
                    attachments: [...(prev.attachments || []), {
                        ...saved,
                        name: saved.name || file.name || t('file.file')
                    }]
                }))
            }
        } catch(err) {
            setUploadErr(err.message || t('file.uploadFailed'))
        } finally {
            setIsUploading(false)
        }
    }

    /** Ctrl+V in the update area: attach images from the clipboard. */
    async function onPasteUpdate(ev){
        const blobs = imagesFromClipboard(ev)
        if(!blobs.length) return
        ev.preventDefault()
        await addFiles(blobs)
    }

    function onPickFiles(ev){
        const files = ev.target.files
        ev.target.value = ''
        addFiles(files)
    }

    function onRemoveAttachment(id){
        setComment(prev => ({...prev, attachments: (prev.attachments || []).filter(a => a._id !== id)}))
    }

    async function onRemoveComment(commentId){
        try {
            // Replies without their update would not be visible anywhere.
            const next = {
                ...currTask,
                comments: currTask.comments.filter(c => c.id !== commentId && c.parentId !== commentId)
            }
            await updateTaskAction(board, groupId, next)
            setCurrTask(next)
        } catch(err) {
            console.log('err:', err)
        }
    }

    function onChangeTextStyle(ev, styleKey, align){
        ev.preventDefault()
        const style = {...comment.style}
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
        setComment((prevComment) => ({...prevComment, style}))
    }

    function handleChange({target}){
        let {value, name: field} = target
        setComment((prevComment) => ({...prevComment, [field]: value}))
    }

    async function onEditComment(saveComment){
        try {
            const next = {...currTask, comments: currTask.comments.map(c => (c.id === saveComment.id)?saveComment:c)}
            await updateTaskAction(board, groupId, next)
            setCurrTask(next)
        } catch(err) {
            console.log('err:', err)
        }
    }

    return <section className="task-modal">
        <div className="task-modal-header flex align-center">
            <Icon name='xmark' className="close-btn" onClick={onCloseModal}/>
            <div className="title">
                <blockquote contentEditable onBlur={onUpdateTaskTitle} suppressContentEditableWarning={true}
                            {...singleLineEditable()}>
                    {task.title}
                </blockquote>
            </div>
        </div>
        <div className="task-modal-type flex">
            <div onClick={() => setIsShowUpdate(!isShowUpdate)} className={`updates-btn ${isShowUpdate?'active':''}`}>
                <Icon name='house'/>
                <span>{t('update.updates')}</span>
            </div>
            <div onClick={() => setIsShowUpdate(!isShowUpdate)} className={`activity-btn ${!isShowUpdate?'active':''}`}>
                <span>{t('activity.activity')}</span>
            </div>
        </div>
        {!isShowUpdate && <ErrorBoundary label={t('activity.area')}>
            <ul className="activities">
                {
                    taskActivities.map((activity, idx) => {
                        return <li key={idx}><ActivityPreview activity={activity}/></li>
                    })
                }
            </ul>
        </ErrorBoundary>}
        {isShowUpdate && <section className="update">
            {!isWriteNewUpdate &&
                <span className="close-input-container flex align-center" onClick={() => setIsWriteNewUpdate(true)}>{t('update.write')}</span>}
            {isWriteNewUpdate && <form className="input-container" onPaste={onPasteUpdate}>
                <div className="style-txt">
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'fontWeight')}><Icon name='bold'/></span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'textDecoration')}><Icon name='underline'/></span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'fontStyle')}>/</span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'textAlign', 'Left')}><Icon name='align-left'/></span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'textAlign', 'Center')}><Icon name='align-center'/></span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'textAlign', 'Right')}><Icon name='align-right'/></span>
                    <span title={t('update.attach')} className="update-attach-btn" onMouseDown={(ev) => {
                        ev.preventDefault();
                        elFileInput.current?.click()
                    }}>
                        <Icon name='paperclip'/>
                    </span>
                </div>
                <MentionTextarea ref={elTextarea} name="txt" members={board.members} style={comment.style} value={comment.txt} placeholder={t('update.placeholder')} onBlur={close} onChange={handleChange}/>

                <input ref={elFileInput} type="file" multiple accept="image/*,.pdf,.doc,.docx,.odt,.rtf,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp,.txt,.md,.json,.xml,.zip,.7z" onChange={onPickFiles} className="update-file-input"/>

                <AttachmentStrip attachments={comment.attachments} onRemove={onRemoveAttachment}/>

                {isUploading && <p className="update-note">{t('update.uploading')}</p>}
                {uploadErr && <p className="update-note is-error">{uploadErr}</p>}
            </form>}
            {isWriteNewUpdate && <div className="button-container">
                <button className="save" onMouseDown={onAddComment} disabled={isUploading || (!comment.txt.trim() && !(comment.attachments || []).length)}>{t('update.update')}</button>
                <button className="cancel" onMouseDown={onDiscard}>{t('update.discard')}</button>
            </div>}
            <ErrorBoundary label={t('update.area')}>
                <ul className="comments-list">
                    {
                        threads.map(({comment, replies}) => {
                            return (
                                <li key={comment.id}>
                                    <CommentPreview onRemoveComment={onRemoveComment} comment={comment} replies={replies} onReply={onAddReply} onEditComment={onEditComment} members={board.members}/>
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
                        <p>Be the first one to update about progress, mention someone
                            <br/>or upload files to share with your team members </p>
                    </div>
                </div>}
        </section>}
    </section>
}