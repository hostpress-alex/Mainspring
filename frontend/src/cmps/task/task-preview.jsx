import {useEffect, useRef, useState} from 'react'
import {useSelector} from 'react-redux'
import {useNavigate} from 'react-router-dom'

import {DueDate} from './date-picker'
import {MemberPicker} from './member-picker'
import {PriorityPicker} from './priority-picker'
import {StatusPicker} from './status-picker'
import {setDynamicModalObj, toggleModal, updateTaskAction} from '../../store/board.actions'
import {boardService} from '../../services/board.service'
import {singleLineEditable, isOnText} from '../../services/editable'
import {UpdatedPicker} from './updated-picker'
import {NumberPicker} from './number-picker'
import {FilePicker} from './file-picker'
import {TextPicker, LongTextPicker, CheckboxPicker, LinkPicker, DropdownPicker} from './simple-pickers'

import { Icon } from '../icon'
import {GUEST_IMG} from '../../services/avatar'
import * as boardRoles from '../../services/board-roles'
import {widthOf, widthStyle, TASK_COLUMN} from '../board/column-width'
import {TaskRunningDot} from '../time/task-timer'
import {t} from '../../i18n'

/**
 * One row of the table — a task or a subtask.
 *
 * A subtask renders through here rather than through a component of its own,
 * and that is the whole point: the first attempt rebuilt the row next to this
 * one and immediately drifted. Cells were missing, the pickers lost their
 * styles because `board-columns.css` hangs off `.task-preview`, and the
 * columns no longer lined up with the row above because the sticky part had a
 * different width. Same markup, same CSS, same widths — a class marks the
 * level and nothing else.
 *
 * A subtask can be ticked like a task. The toolbar that appears works out per
 * action what the selection allows and leaves out what does not apply — see
 * task-tools-modal.
 */
export function TaskPreview({
    task, group, board,
    handleCheckboxChange = () => {}, isSelected = false,
    widths = {}, isSubtasksOpen = false, onToggleSubtasks, isSubtask = false
}){
    const isOpen = useSelector((storeState) => storeState.boardModule.isBoardModalOpen)
    const user = useSelector(storeState => storeState.userModule.user)
    const dynamicModalObj = useSelector(storeState => storeState.boardModule.dynamicModalObj)
    // A viewer reads the board and writes comments. Everything in this row
    // that is not reading is left out rather than disabled: a tick box that
    // ticks and then does nothing is worse than no tick box, because the
    // person has already decided what they were going to do with it.
    const canWork = boardRoles.canEdit(board, user)
    const elTaskPreview = useRef(null)
    const elMenuTask = useRef()
    const navigate = useNavigate()
    // Only standalone updates count — replies hang off them and would otherwise
    // inflate the number in the row.
    const updateCount = (task.comments || []).filter(c => c && !c.parentId).length
    const hasSubtasks = (task.subtasks || []).length > 0

    async function updateTask(cmpType, data, activity){
        // The last stop before a write that the server will refuse anyway.
        // Without it the value changes on screen, the request comes back 403,
        // and the cell snaps back a moment later with no explanation.
        if(!canWork) return
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
        // Off first, whatever happens next. The old code toggled the typing
        // state inside the save, so leaving a title untouched left the row
        // marked as being edited — with nothing editing it — until the page
        // was reloaded.
        setTyping(false)
        if(!canWork || value === task.title) return
        const activity = boardService.getEmptyActivity()
        activity.action = 'title'
        activity.task = {id: task.id, title: value}
        activity.from = task.title
        activity.to = value
        try {
            await updateTaskAction(board, group.id, {...task, title: value}, activity)
        } catch(err) {
            console.log('saving failed')
        }
    }

    function onOpenModal(){
        // The URL drives the dialog — no extra toggling needed.
        navigate(`/board/${board._id}/${group.id}/${task.id}`)
    }

    /**
     * The title cell means two things, and where you click decides which.
     *
     * On the words: put the caret in, rename the task. Anywhere else in the
     * cell: open the task. Before this, the whole cell was one big text field,
     * so the ordinary thing to want — see the task — cost a click into the
     * empty space, a caret nobody asked for, and a click back out.
     *
     * mousedown rather than click, because the caret is placed on mousedown:
     * by the time a click event arrives the field is already focused and the
     * row is already in its typing state.
     */
    function onTitleMouseDown(ev){
        const el = ev.currentTarget
        // Once the caret is in there, every click is a caret click — moving it
        // through the text must not throw the dialog open.
        if(el === document.activeElement || el.contains(document.activeElement)) return
        // A viewer cannot rename anything, so for them the whole cell opens
        // the task rather than half of it doing nothing.
        if(canWork && isOnText(el, ev.clientX)) return
        // No caret, no focus, no typing state.
        ev.preventDefault()
        onOpenModal()
    }

    /**
     * Whether the box is ticked comes from the selection above, not from a
     * copy kept down here. The private flag it replaces had to be nudged back
     * into line by an effect whenever the header box changed, and any path
     * that cleared the selection without touching that flag left a row ticked
     * with nothing selected.
     */
    function onCheckBoxChange(){
        handleCheckboxChange(task)
    }

    function onToggleTaskModal(){
        const isOpen = dynamicModalObj?.task?.id === task.id && dynamicModalObj?.type === 'menu-task'?!dynamicModalObj.isOpen:true
        const {x, y, height} = elMenuTask.current.getClientRects()[0]
        setDynamicModalObj({isOpen, pos: {x: (x - 10), y: (y + height)}, type: 'menu-task', group: group, task: task})
    }

    /**
     * Set, not toggled. A toggle only stays right as long as both halves of
     * every path fire, and they did not — see onUpdateTaskTitle.
     */
    function setTyping(isTyping){
        if(elMenuTask.current) elMenuTask.current.classList.toggle('on-typing', isTyping)
        if(elTaskPreview.current) elTaskPreview.current.classList.toggle('on-typing', isTyping)
    }

    return (
        <section className={`task-preview flex${isSubtask?' is-subtask':''}`} ref={elTaskPreview}>
            <div ref={elMenuTask} className="sticky-div" style={{'--group-color': group.color}}>
                <div className="task-menu">
                    {canWork && <Icon name='ellipsis' className="icon" onClick={onToggleTaskModal}/>}
                </div>
                {/* The box itself stays: it is a column of the table, and a
                    row that leaves it out is a row that does not line up with
                    the ones above it. Only the tick goes. */}
                <div className="check-box">
                    {canWork && <input type="checkbox" checked={isSelected} onChange={onCheckBoxChange}/>}
                </div>
                <div className="task-title picker flex align-center space-between" style={widthStyle(widthOf(widths, TASK_COLUMN))}>
                    {/* Always in the DOM, but only visible on a row that has
                        children — on the others it appears on hover. It cannot
                        simply be left out: an arrow that is not rendered takes
                        its width with it, and the title of a row with subtasks
                        would then sit further right than the one below it. */}
                    {onToggleSubtasks && !isSubtask && (
                        <button type="button" className={`subtask-toggle${hasSubtasks?'':' is-empty'}`}
                                title={isSubtasksOpen?t('task.hideSubtasks'):t('task.showSubtasks')}
                                onClick={ev => {
                                    ev.stopPropagation()
                                    onToggleSubtasks()
                                }}>
                            <Icon name={isSubtasksOpen?'chevron-down':'chevron-right'}/>
                        </button>
                    )}
                    {/* A heading you can type into and cannot save is the
                        same trap as the tick box above. */}
                    <blockquote contentEditable={canWork} onBlur={onUpdateTaskTitle} suppressContentEditableWarning={true}
                                onMouseDown={onTitleMouseDown}
                                {...singleLineEditable({onFocus: () => setTyping(true)})}>
                        <span>{task.title}</span>
                    </blockquote>
                    {/* Only the fact that something is running. Operating it
                        happens in the task itself, where its name is on
                        screen — see task-timer.jsx. */}
                    <TaskRunningDot board={board} task={task}/>
                    <div className="open-task-details " onClick={onOpenModal}>
                        <Icon name='up-right-and-down-left-from-center'/>
                    </div>
                    <div onClick={onOpenModal} className="chat-icon">
                        {updateCount > 0 && <div>
                            <Icon name='comment' variant='fa-regular' className="comment-chat"/>
                            <div className="count-comment">{updateCount}</div>
                        </div>}
                        {updateCount === 0 && <Icon name='comment-medical' className="icon"/>}
                    </div>
                </div>
            </div>
            {(board.columns || []).map(column => (
                <DynamicCmp key={column.id} column={column} board={board} info={task} width={widthOf(widths, column)} onUpdate={updateTask} readOnly={!canWork}/>
            ))}
            <div className="empty-div"></div>
        </section>
    )
}

/**
 * Renders a column by its type. `field` says where the value sits.
 *
 * `readOnly` goes to every picker, and each decides for itself what reading
 * means for it: a status keeps its colour and loses its menu, a text field
 * stays selectable and stops taking input, a file keeps its preview and loses
 * its upload. That is why it is a prop and not `pointer-events: none` on this
 * cell — the blunt version would also take away marking a value to copy it,
 * and reading is the whole of what a viewer is here for.
 */
export function DynamicCmp({column, info, onUpdate, board, width, readOnly = false}){
    const field = column.field || column.id
    const props = {info, onUpdate, field, column, readOnly, board}

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