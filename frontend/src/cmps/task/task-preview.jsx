import {useEffect, useRef, useState} from 'react'
import {useSelector} from 'react-redux'
import {useNavigate} from 'react-router-dom'

import {DueDate} from './date-picker'
import {MemberPicker} from './member-picker'
import {PriorityPicker} from './priority-picker'
import {StatusPicker} from './status-picker'
import {setDynamicModalObj, toggleModal, updateTaskAction} from '../../store/board.actions'
import {boardService} from '../../services/board.service'
import {singleLineEditable} from '../../services/editable'
import {UpdatedPicker} from './updated-picker'
import {NumberPicker} from './number-picker'
import {FilePicker} from './file-picker'
import {TextPicker, LongTextPicker, CheckboxPicker, LinkPicker, DropdownPicker} from './simple-pickers'

import { Icon } from '../icon'
import {GUEST_IMG} from '../../services/avatar'
import {widthOf, widthStyle, TASK_COLUMN} from '../board/column-width'
import '../board/board-columns.css'
import {t} from '../../i18n'

export function TaskPreview({task, group, board, handleCheckboxChange, isMainCheckbox, widths = {}}){
    const [isClick, setIsClick] = useState(false)
    const isOpen = useSelector((storeState) => storeState.boardModule.isBoardModalOpen)
    const user = useSelector(storeState => storeState.userModule.user)
    const dynamicModalObj = useSelector(storeState => storeState.boardModule.dynamicModalObj)
    const elTaskPreview = useRef(null)
    const elMenuTask = useRef()
    const navigate = useNavigate()
    // Only standalone updates count — replies hang off them and would otherwise
    // inflate the number in the row.
    const updateCount = (task.comments || []).filter(c => c && !c.parentId).length
    useEffect(() => {
        setIsClick(isMainCheckbox.isActive)
    }, [isMainCheckbox])

    async function updateTask(cmpType, data, activity){
        const taskToUpdate = structuredClone(task)
        taskToUpdate[cmpType] = data
        taskToUpdate.updatedBy.date = Date.now()
        taskToUpdate.updatedBy.imgUrl = (user && user.imgUrl) || GUEST_IMG
        try {
            await updateTaskAction(board, group.id, taskToUpdate, activity)
        } catch(err) {
            console.log(err)
        }
    }

    async function onUpdateTaskTitle(ev){
        const value = ev.target.innerText
        if(value === task.title) return
        const activity = boardService.getEmptyActivity()
        activity.action = 'title'
        activity.task = {id: task.id, title: value}
        activity.from = task.title
        activity.to = value
        try {
            toggleOnTyping()
            await updateTaskAction(board, group.id, {...task, title: value}, activity)
        } catch(err) {
            console.log('saving failed')
        }
    }

    function onOpenModal(){
        // The URL drives the dialog — no extra toggling needed.
        navigate(`/board/${board._id}/${group.id}/${task.id}`)
    }

    function onCheckBoxChange(){
        handleCheckboxChange(task)
        setIsClick(!isClick)
    }

    function onToggleTaskModal(){
        const isOpen = dynamicModalObj?.task?.id === task.id && dynamicModalObj?.type === 'menu-task'?!dynamicModalObj.isOpen:true
        const {x, y, height} = elMenuTask.current.getClientRects()[0]
        setDynamicModalObj({isOpen, pos: {x: (x - 10), y: (y + height)}, type: 'menu-task', group: group, task: task})
    }

    function toggleOnTyping(){
        elMenuTask.current.classList.toggle('on-typing')
        elTaskPreview.current.classList.toggle('on-typing')
    }

    return (
        <section className={'task-preview flex'} ref={elTaskPreview}>
            <div ref={elMenuTask} className="sticky-div" style={{'--group-color': group.color}}>
                <div className="task-menu">
                    <Icon name='ellipsis' className="icon" onClick={onToggleTaskModal}/>
                </div>
                <div className="check-box">
                    <input type="checkbox" checked={isClick} onChange={onCheckBoxChange}/>
                </div>
                <div className="task-title picker flex align-center space-between" style={widthStyle(widthOf(widths, TASK_COLUMN))}>
                    <blockquote contentEditable onBlur={onUpdateTaskTitle} suppressContentEditableWarning={true}
                                {...singleLineEditable({onFocus: toggleOnTyping})}>
                        <span>{task.title}</span>
                    </blockquote>
                    <div className="open-task-details " onClick={onOpenModal}>
                        <Icon name='expand'/>
                        <span className="open-btn">{t('common.open')}</span>
                    </div>
                    <div onClick={onOpenModal} className="chat-icon">
                        {updateCount > 0 && <div>
                            <Icon name='comment' style='fa-regular' className="comment-chat"/>
                            <div className="count-comment">{updateCount}</div>
                        </div>}
                        {updateCount === 0 && <Icon name='comment-medical' className="icon"/>}
                    </div>
                </div>
            </div>
            {(board.columns || []).map(column => (
                <DynamicCmp key={column.id} column={column} board={board} info={task} width={widthOf(widths, column)} onUpdate={updateTask}/>
            ))}
            <div className="empty-div"></div>
        </section>
    )
}

/** Renders a column by its type. `field` says where the value sits. */
export function DynamicCmp({column, info, onUpdate, board, width}){
    const field = column.field || column.id
    const props = {info, onUpdate, field, column}

    const inner = renderPicker()
    return <div className="col-cell" style={width?widthStyle(width):undefined}>{inner}</div>

    function renderPicker(){
        switch(column.type) {
            case 'status':
                return <StatusPicker {...props} />
            case 'person':
                return <MemberPicker {...props} />
            case 'date':
                return <DueDate {...props} />
            case 'priority':
                return <PriorityPicker {...props} />
            case 'number':
                return <NumberPicker {...props} />
            case 'file':
                return <FilePicker {...props} />
            case 'updated':
                return <UpdatedPicker {...props} />
            case 'text':
                return <TextPicker {...props} />
            case 'longtext':
                return <LongTextPicker {...props} />
            case 'checkbox':
                return <CheckboxPicker {...props} />
            case 'link':
                return <LinkPicker {...props} />
            case 'dropdown':
                return <DropdownPicker {...props} board={board}/>
            default:
                return <section className="picker">—</section>
        }
    }
}