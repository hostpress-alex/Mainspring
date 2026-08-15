import { useRef, useState } from "react"
import { useSelector } from "react-redux"
import { useNavigate } from "react-router-dom"

import { duplicateTask, toggleModal, updateGroupAction, updateTaskAction } from "../../store/board.actions"
import { confirmDelete } from "../confirm-dialog"

import { TbArrowsDiagonal } from 'react-icons/tb'
import { BiDotsHorizontalRounded, BiMessageRoundedAdd } from 'react-icons/bi'
import { TaskMenuModal } from "../modal/task-menu-modal"
import { utilService } from "../../services/util.service"
import { boardService } from "../../services/board.service"
import { HiOutlineChatBubbleOvalLeft } from 'react-icons/hi2'
import { GUEST_IMG } from '../../services/avatar'
import { DynamicCmp } from '../task/task-preview'
import { widthOf } from '../board/column-width'
import { t } from '../../i18n'

export function TaskPreviewKanban({ task, group, board , isTaskModalOpen ,setIsTaskModalOpen, widths = {} }) {
    const user = useSelector(storeState => storeState.userModule.user)
    const navigate = useNavigate()
    async function updateTask(cmpType, data, activity) {
        task[cmpType] = data
        task.updatedBy.date = Date.now()
        task.updatedBy.imgUrl = (user && user.imgUrl) || GUEST_IMG
        try {
            await updateTaskAction(board, group.id, task, activity)
        } catch (err) {
            console.log(err)
        }
    }


    async function onRemoveTask(taskId) {
        const toDelete = (group.tasks || []).find(x => x.id === taskId)
        if (!await confirmDelete({ what: toDelete?.title ? t('task.deleteName', { title: toDelete.title }) : t('task.thisTask') })) return
        try {
            const tasksToSave = group.tasks.filter(task => task.id !== taskId)
            group.tasks = tasksToSave
            await updateGroupAction(board, group)
            setIsTaskModalOpen(false)
        } catch (err) {
            console.log('deleting a task failed', err)
        }
    }

    async function onDuplicateTask() {
        try {
            duplicateTask(board, group, task)
            setIsTaskModalOpen(false)
        } catch (err) {
            console.log(err)
        }
    }

    async function onCreateNewTaskBelow() {
        try {
            const newTask = boardService.getEmptyTask()
            newTask.id = utilService.makeId()
            newTask.title = 'New Task'
            const idx = group.tasks.indexOf(task)
            group.tasks.splice(idx + 1, 0, newTask)
            updateGroupAction(board, group)
            setIsTaskModalOpen(false)
        } catch (err) {
            console.log(err)
        }
    }
 
    return (
        <section className={`task-preview-kanban ${isTaskModalOpen ? ' modal-open' : ''}`}>

            {isTaskModalOpen && <TaskMenuModal taskId={task.id} onRemoveTask={onRemoveTask} onDuplicateTask={onDuplicateTask}
                 onCreateNewTaskBelow={onCreateNewTaskBelow} />}
            
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
