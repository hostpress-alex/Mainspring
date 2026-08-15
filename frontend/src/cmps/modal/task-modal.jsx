import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useSelector } from "react-redux"

import { toggleModal, updateTaskAction } from "../../store/board.actions"

import { CgClose } from 'react-icons/cg'
import { MdAttachFile } from 'react-icons/md'
import { GrHomeRounded } from 'react-icons/gr'
import { AiOutlineBold } from 'react-icons/ai'
import { RxUnderline } from 'react-icons/rx'
import { TbAlignRight, TbAlignCenter, TbAlignLeft } from 'react-icons/tb'

import { boardService } from "../../services/board.service"
import { singleLineEditable } from "../../services/editable"
import { utilService } from "../../services/util.service"
import { CommentPreview } from "../task/comment-preview"
import { ActivityPreview } from "../activity-preview"
import { ErrorBoundary } from "../error-boundary"
import { socketService, SOCKET_EMIT_SEND_MSG, SOCKET_EMIT_SET_TOPIC, SOCKET_EVENT_ADD_MSG } from "../../services/socket.service"
import noUpdate from '../../assets/img/empty-update.png'
import { uploadFile, imagesFromClipboard } from '../../services/upload.service'
import { AttachmentStrip } from '../task/attachment-strip'
export function TaskModal({ task, board, groupId, setModalCurrTask }) {
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

    // Beim Wechsel auf einen anderen Task muss der lokale Stand mitziehen —
    // sonst zeigt der Dialog weiter den vorherigen Task.
    useEffect(() => {
        setCurrTask(task)
        setComment(boardService.getEmptyComment())
        setIsWriteNewUpdate(false)
    }, [task])

    // Wer auf "Write an update" klickt, will schreiben — nicht erst noch
    // einmal ins Feld klicken muessen.
    useEffect(() => {
        if (isWriteNewUpdate) elTextarea.current?.focus()
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
     * Kommentar von einem anderen Browser (Socket). Bewusst mit neuen Objekten
     * statt unshift: currTask ist dasselbe Objekt wie im Store, und wer daran
     * direkt herumaendert, macht den Vergleich beim Speichern blind.
     */
    function addComment(comment) {
        setCurrTask(prev => ({ ...prev, comments: [comment, ...(prev.comments || [])] }))
    }

    /**
     * Updates und ihre Antworten. Antworten sind Kommentare mit parentId;
     * sie erscheinen chronologisch unter ihrem Update, waehrend die Updates
     * selbst neueste zuerst stehen.
     */
    const threads = useMemo(() => {
        const all = currTask.comments || []
        const byParent = new Map()
        for (const c of all) {
            if (!c || !c.parentId) continue
            if (!byParent.has(c.parentId)) byParent.set(c.parentId, [])
            byParent.get(c.parentId).push(c)
        }
        for (const list of byParent.values()) {
            list.sort((a, b) => (a.archivedAt || 0) - (b.archivedAt || 0))
        }
        return all
            .filter(c => c && !c.parentId)
            .map(c => ({ comment: c, replies: byParent.get(c.id) || [] }))
    }, [currTask.comments])

    async function onAddReply(parentId, txt) {
        const clean = String(txt || '').trim()
        if (!clean) return
        const reply = boardService.getEmptyComment()
        reply.id = utilService.makeId()
        reply.parentId = parentId
        reply.txt = clean
        reply.archivedAt = Date.now()
        if (user) {
            reply.byMember = { _id: user._id, fullname: user.fullname, imgUrl: user.imgUrl || '' }
        }
        const next = { ...currTask, comments: [reply, ...(currTask.comments || [])] }
        await updateTaskAction(board, groupId, next)
        setCurrTask(next)
    }

    function loadTaskActivity() {
        // 'check' war das Markieren fuer die Mehrfachauswahl — wird nicht mehr
        // erzeugt. Alte Eintraege werden hier ausgeblendet und rotieren mit der
        // Zeit von selbst aus der Liste (max. 40 Eintraege pro Board).
        const taskActivities = (board.activities || [])
            .filter(activity => activity && activity.task && activity.task.id === task.id)
            .filter(activity => activity.action !== 'check')
        setTaskActivities(taskActivities)
    }

    function onCloseModal() {
        navigate(`/board/${board._id}`)
        setComment(boardService.getEmptyComment())
    }

    async function onUpdateTaskTitle(ev) {
        const value = ev.target.innerText
        if (value === currTask.title) return
        const next = { ...currTask, title: value }
        const activity = boardService.getEmptyActivity()
        activity.action = 'title'
        activity.task = { id: currTask.id, title: value }
        activity.from = currTask.title
        activity.to = value
        try {
            await updateTaskAction(board, groupId, next, activity)
            setCurrTask(next)
        } catch (err) {
            console.log('Speichern fehlgeschlagen')
        }
    }

    async function onAddComment() {
        if (isUploading) return
        if (!comment.txt.trim() && !(comment.attachments || []).length) return
        try {
            comment.id = utilService.makeId()
            if (user) {
                comment.byMember.fullname = user.fullname
                comment.byMember.imgUrl = user.imgUrl
            }
            const next = { ...currTask, comments: [comment, ...(currTask.comments || [])] }
            socketService.emit(SOCKET_EMIT_SEND_MSG, comment)
            await updateTaskAction(board, groupId, next)
            setIsWriteNewUpdate(false)
            setCurrTask(next)
            setComment(boardService.getEmptyComment())
        } catch (err) {
            console.log('err:', err)
        }
    }

    /**
     * Der Entwurf darf nur verworfen werden, wenn der Fokus das Formular
     * wirklich verlaesst. Vorher hat ein Klick auf einen Button im Formular
     * (z.B. Datei anhaengen) den halbfertigen Update geloescht.
     */
    function close(ev) {
        const next = ev.relatedTarget
        if (next && ev.currentTarget.closest('.update')?.contains(next)) return
        if (isUploading || comment.txt || (comment.attachments || []).length) return
        setIsWriteNewUpdate(false)
        setUploadErr(null)
        setComment(boardService.getEmptyComment())
    }

    function onDiscard(ev) {
        ev.preventDefault()
        setIsWriteNewUpdate(false)
        setUploadErr(null)
        setComment(boardService.getEmptyComment())
    }

    async function addFiles(files) {
        const list = Array.from(files || [])
        if (!list.length) return
        setUploadErr(null)
        setIsUploading(true)
        try {
            for (const file of list) {
                const saved = await uploadFile(file, { scope: 'task', taskId: currTask.id, name: file.name })
                setComment(prev => ({
                    ...prev,
                    attachments: [...(prev.attachments || []), { ...saved, name: saved.name || file.name || 'Datei' }],
                }))
            }
        } catch (err) {
            setUploadErr(err.message || 'Upload fehlgeschlagen')
        } finally {
            setIsUploading(false)
        }
    }

    /** Strg+V im Update-Bereich: Bilder aus der Zwischenablage anhaengen. */
    async function onPasteUpdate(ev) {
        const blobs = imagesFromClipboard(ev)
        if (!blobs.length) return
        ev.preventDefault()
        await addFiles(blobs)
    }

    function onPickFiles(ev) {
        const files = ev.target.files
        ev.target.value = ''
        addFiles(files)
    }

    function onRemoveAttachment(id) {
        setComment(prev => ({ ...prev, attachments: (prev.attachments || []).filter(a => a._id !== id) }))
    }

    async function onRemoveComment(commentId) {
        try {
            // Antworten ohne ihr Update waeren nirgends mehr sichtbar.
            const next = {
                ...currTask,
                comments: currTask.comments.filter(c => c.id !== commentId && c.parentId !== commentId),
            }
            await updateTaskAction(board, groupId, next)
            setCurrTask(next)
        } catch (err) {
            console.log('err:', err)
        }
    }

    function onChangeTextStyle(ev, styleKey, align) {
        ev.preventDefault()
        const style = { ...comment.style }
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
        setComment((prevComment) => ({ ...prevComment, style }))
    }

    function handleChange({ target }) {
        let { value, name: field } = target
        setComment((prevComment) => ({ ...prevComment, [field]: value }))
    }

    async function onEditComment(saveComment) {
        try {
            const next = { ...currTask, comments: currTask.comments.map(c => (c.id === saveComment.id) ? saveComment : c) }
            await updateTaskAction(board, groupId, next)
            setCurrTask(next)
        } catch (err) {
            console.log('err:', err)
        }
    }
    return <section className='task-modal'>
        <div className="task-modal-header flex align-center">
            <CgClose className="close-btn" onClick={onCloseModal} />
            <div className="title">
                <blockquote contentEditable onBlur={onUpdateTaskTitle} suppressContentEditableWarning={true}
                    {...singleLineEditable()}>
                    {task.title}
                </blockquote>
            </div>
        </div>
        <div className="task-modal-type flex">
            <div onClick={() => setIsShowUpdate(!isShowUpdate)} className={`updates-btn ${isShowUpdate ? 'active' : ''}`}>
                <GrHomeRounded />
                <span>Updates</span>
            </div>
            <div onClick={() => setIsShowUpdate(!isShowUpdate)} className={`activity-btn ${!isShowUpdate ? 'active' : ''}`}>
                <span>Verlauf</span>
            </div>
        </div>
        {!isShowUpdate && <ErrorBoundary label="Der Verlauf">
            <ul className="activities">
                {
                    taskActivities.map((activity, idx) => {
                        return <li key={idx}><ActivityPreview activity={activity} /></li>
                    })
                }
            </ul>
        </ErrorBoundary>}
        {isShowUpdate && <section className="update">
            {!isWriteNewUpdate && <span className="close-input-container flex align-center" onClick={() => setIsWriteNewUpdate(true)}>Update schreiben</span>}
            {isWriteNewUpdate && <form className="input-container" onPaste={onPasteUpdate}>
                <div className="style-txt">
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'fontWeight')}><AiOutlineBold /></span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'textDecoration')}><RxUnderline /></span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'fontStyle')}>/</span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'textAlign', 'Left')}><TbAlignLeft /></span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'textAlign', 'Center')}><TbAlignCenter /></span>
                    <span onMouseDown={(ev) => onChangeTextStyle(ev, 'textAlign', 'Right')}><TbAlignRight /></span>
                    <span title="Bild oder Datei anhängen" style={{ marginLeft: 'auto' }}
                        onMouseDown={(ev) => { ev.preventDefault(); elFileInput.current?.click() }}>
                        <MdAttachFile />
                    </span>
                </div>
                <textarea
                    ref={elTextarea}
                    name="txt"
                    style={comment.style}
                    value={comment.txt}
                    placeholder="Update schreiben — Bilder kannst du mit Strg+V einfügen"
                    onBlur={close}
                    onChange={handleChange}></textarea>

                <input ref={elFileInput} type="file" multiple
                    accept="image/*,.pdf,.doc,.docx,.odt,.rtf,.xls,.xlsx,.ods,.csv,.ppt,.pptx,.odp,.txt,.md,.json,.xml,.zip,.7z"
                    onChange={onPickFiles} style={{ display: 'none' }} />

                <AttachmentStrip attachments={comment.attachments} onRemove={onRemoveAttachment} />

                {isUploading && <p style={{ fontSize: 13, color: '#676879', margin: '8px 0 0' }}>Wird hochgeladen…</p>}
                {uploadErr && <p style={{ fontSize: 13, color: '#a3283a', margin: '8px 0 0' }}>{uploadErr}</p>}
            </form>}
            {isWriteNewUpdate && <div className="button-container">
                <button className="save" onMouseDown={onAddComment}
                    disabled={isUploading || (!comment.txt.trim() && !(comment.attachments || []).length)}>Update</button>
                <button className="cancel" onMouseDown={onDiscard}>Verwerfen</button>
            </div>}
            <ErrorBoundary label="Die Updates">
            <ul className="comments-list">
                {
                    threads.map(({ comment, replies }) => {
                        return (
                            <li key={comment.id}>
                                <CommentPreview
                                    onRemoveComment={onRemoveComment}
                                    comment={comment}
                                    replies={replies}
                                    onReply={onAddReply}
                                    onEditComment={onEditComment} />
                            </li>
                        )
                    })
                }
            </ul>
            </ErrorBoundary>
            {threads.length === 0 &&
                <div className="no-updates flex column align-center">
                    <img src={noUpdate} alt="" />
                    <div className="txt flex column align-center">
                        <h2>Noch keine Updates zu diesem Task</h2>
                        <p>Be the first one to update about progress, mention someone
                            <br />or upload files to share with your team members
                        </p>
                    </div>
                </div>}
        </section>}
    </section>
}