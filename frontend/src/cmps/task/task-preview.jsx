import { useEffect, useRef, useState } from "react"
import { useSelector } from "react-redux"
import { useNavigate } from "react-router-dom"

import { DueDate } from "./date-picker"
import { MemberPicker } from "./member-picker"
import { PriorityPicker } from "./priority-picker"
import { StatusPicker } from "./status-picker"
import { setDynamicModalObj, toggleModal, updateTaskAction } from "../../store/board.actions"
import { boardService } from "../../services/board.service"
import { singleLineEditable } from "../../services/editable"
import { UpdatedPicker } from "./updated-picker"
import { NumberPicker } from "./number-picker"
import { FilePicker } from "./file-picker"
import { TextPicker, LongTextPicker, CheckboxPicker, LinkPicker, DropdownPicker } from "./simple-pickers"

import { TbArrowsDiagonal } from 'react-icons/tb'
import { BiDotsHorizontalRounded, BiMessageRoundedAdd } from 'react-icons/bi'
import { HiOutlineChatBubbleOvalLeft } from 'react-icons/hi2'
import { GUEST_IMG } from '../../services/avatar'
import { widthOf, widthStyle } from '../board/column-width'
import '../board/board-columns.css'

export function TaskPreview({ task, group, board, handleCheckboxChange, isMainCheckbox, widths = {} }) {
    const [isClick, setIsClick] = useState(false)
    const isOpen = useSelector((storeState) => storeState.boardModule.isBoardModalOpen)
    const user = useSelector(storeState => storeState.userModule.user)
    const dynamicModalObj = useSelector(storeState => storeState.boardModule.dynamicModalObj)
    const elTaskPreview = useRef(null)
    const elMenuTask = useRef()
    const navigate = useNavigate()
    // Nur eigenstaendige Updates zaehlen — Antworten haengen daran und wuerden
    // die Zahl in der Zeile sonst aufblaehen.
    const updateCount = (task.comments || []).filter(c => c && !c.parentId).length
    useEffect(() => {
        setIsClick(isMainCheckbox.isActive)
    }, [isMainCheckbox])

    async function updateTask(cmpType, data, activity) {
        const taskToUpdate = structuredClone(task)
        taskToUpdate[cmpType] = data
        taskToUpdate.updatedBy.date = Date.now()
        taskToUpdate.updatedBy.imgUrl = (user && user.imgUrl) || GUEST_IMG
        try {
            await updateTaskAction(board, group.id, taskToUpdate, activity)
        } catch (err) {
            console.log(err)
        }
    }

    async function onUpdateTaskTitle(ev) {
        const value = ev.target.innerText
        if (value === task.title) return
        const activity = boardService.getEmptyActivity()
        activity.action = 'title'
        activity.task = { id: task.id, title: value }
        activity.from = task.title
        activity.to = value
        try {
            toggleOnTyping()
            await updateTaskAction(board, group.id, { ...task, title: value }, activity)
        } catch (err) {
            console.log('Speichern fehlgeschlagen')
        }
    }

    function onOpenModal() {
        // Die URL steuert den Dialog — kein zusaetzliches Umschalten noetig.
        navigate(`/board/${board._id}/${group.id}/${task.id}`)
    }

    function onCheckBoxChange() {
        handleCheckboxChange(task)
        setIsClick(!isClick)
    }

    function onToggleTaskModal() {
        const isOpen = dynamicModalObj?.task?.id === task.id && dynamicModalObj?.type === 'menu-task' ? !dynamicModalObj.isOpen : true
        const { x, y, height } = elMenuTask.current.getClientRects()[0]
        setDynamicModalObj({ isOpen, pos: { x: (x - 10), y: (y + height) }, type: 'menu-task', group: group, task: task })
    }

    function toggleOnTyping() {
        elMenuTask.current.classList.toggle('on-typing')
        elTaskPreview.current.classList.toggle('on-typing')
    }

    return (
        <section className={'task-preview flex'} ref={elTaskPreview}>
            <div ref={elMenuTask} className="sticky-div" style={{ borderColor: group.color }}>
                <div className="task-menu">
                    <BiDotsHorizontalRounded className="icon" onClick={onToggleTaskModal} />
                </div>
                <div className="check-box">
                    <input type="checkbox" checked={isClick} onChange={onCheckBoxChange} />
                </div>
                <div className="task-title picker flex align-center space-between">
                    <blockquote contentEditable
                        onBlur={onUpdateTaskTitle} suppressContentEditableWarning={true}
                        {...singleLineEditable({ onFocus: toggleOnTyping })}>
                        <span>{task.title}</span>
                    </blockquote>
                    <div className="open-task-details " onClick={onOpenModal}>
                        <TbArrowsDiagonal />
                        <span className="open-btn">Öffnen</span>
                    </div>
                    <div onClick={onOpenModal} className="chat-icon">
                        {updateCount > 0 && <div>
                            <HiOutlineChatBubbleOvalLeft className="comment-chat" />
                            <div className="count-comment">{updateCount}</div>
                        </div>}
                        {updateCount === 0 && <BiMessageRoundedAdd className="icon" />}
                    </div>
                </div>
            </div>
            {(board.columns || []).map(column => (
                <DynamicCmp
                    key={column.id}
                    column={column}
                    board={board}
                    info={task}
                    width={widthOf(widths, column)}
                    onUpdate={updateTask}
                />
            ))}
            <div className="empty-div"></div>
        </section>
    )
}

/** Rendert eine Spalte anhand ihres Typs. `field` sagt, wo der Wert liegt. */
export function DynamicCmp({ column, info, onUpdate, board, width }) {
    const field = column.field || column.id
    const props = { info, onUpdate, field, column }

    const inner = renderPicker()
    return <div className='col-cell' style={width ? widthStyle(width) : undefined}>{inner}</div>

    function renderPicker () {
    switch (column.type) {
        case 'status':   return <StatusPicker {...props} />
        case 'person':   return <MemberPicker {...props} />
        case 'date':     return <DueDate {...props} />
        case 'priority': return <PriorityPicker {...props} />
        case 'number':   return <NumberPicker {...props} />
        case 'file':     return <FilePicker {...props} />
        case 'updated':  return <UpdatedPicker {...props} />
        case 'text':     return <TextPicker {...props} />
        case 'longtext': return <LongTextPicker {...props} />
        case 'checkbox': return <CheckboxPicker {...props} />
        case 'link':     return <LinkPicker {...props} />
        case 'dropdown': return <DropdownPicker {...props} board={board} />
        default:         return <section className='picker'>—</section>
    }
    }
}