import {useRef} from 'react'
import {useSelector} from 'react-redux'
import {useNavigate} from 'react-router-dom'

import { Icon } from '../icon'
import {setDynamicModalObj, updateTaskAction} from '../../store/board.actions'
import {boardService} from '../../services/board.service'
import {singleLineEditable} from '../../services/editable'
import * as boardRoles from '../../services/board-roles'
import {ChecklistMark} from '../task/checklist-mark'
import {TimeMark} from '../task/time-mark'
import {CardMembers} from './card-members'

export function TaskTitleKanban({task, group, board}){
    const dynamicModalObj = useSelector(storeState => storeState.boardModule.dynamicModalObj)
    const user = useSelector(storeState => storeState.userModule.user)
    const canWork = boardRoles.canEdit(board, user)
    const navigate = useNavigate()
    const elTaskModalBtn = useRef()

    function onOpenModal(task){
        navigate(`/board/${board._id}/${group.id}/${task.id}`)
    }

    function onToggleTaskModal(task){
        const isOpen = dynamicModalObj?.task?.id === task.id && dynamicModalObj?.type === 'menu-task'?!dynamicModalObj.isOpen:true
        const {x, y} = elTaskModalBtn.current.getClientRects()[0]
        setDynamicModalObj({isOpen, pos: {x: (x - 180), y: (y + 25)}, type: 'menu-task', group: group, task: task})
    }

    async function onUpdateTaskTitle(ev, task){
        const value = ev.target.innerText
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

    return (
        <section className="task-title">
            <blockquote contentEditable={canWork} onBlur={(ev) => onUpdateTaskTitle(ev, task)} suppressContentEditableWarning={true}
                        {...singleLineEditable()}>
                <span>{task.title}</span>
            </blockquote>
            {/* Who has it, as a face rather than as a label/value line in the
                card body. On a Kanban "who is doing this" is the first
                question, and a row saying "Person: Alex" costs a line of card
                height to answer it worse. */}
            <CardMembers task={task} board={board}/>
            {/* Filled circle = time, stroked ring with a tick = checklist.
                Two shapes on purpose: they would otherwise be read as the
                same measurement. */}
            <TimeMark board={board} task={task}/>
            <ChecklistMark task={task} onOpen={() => onOpenModal(task)}/>
            <div onClick={() => onOpenModal(task)} className="chat-icon">
                {task.comments.length > 0 && <div>
                    <Icon name='comment' variant='fa-regular' className="comment-chat"/>
                    <div className="count-comment">{task.comments.length}</div>
                </div>}
                {task.comments.length === 0 && <Icon name='comment-medical' className="icon"/>}
            </div>
            <div className="task-menu" ref={elTaskModalBtn}>
                <Icon name='ellipsis' className="icon" onClick={() => onToggleTaskModal(task)}/>
            </div>
        </section>
    )
}