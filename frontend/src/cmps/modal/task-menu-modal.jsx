import { Icon } from '../icon'
import {useSelector} from 'react-redux';
import {useNavigate} from 'react-router-dom';
import {boardService} from '../../services/board.service';
import {utilService} from '../../services/util.service';
import {duplicateTask, setDynamicModalObj, updateGroupAction, setTaskParentAction, removeTaskAction, addSubtaskAction} from '../../store/board.actions';
import {confirmDelete} from '../confirm-dialog';
import {t} from '../../i18n'

export function TaskMenuModal({dynamicModalObj}){
    const board = useSelector(storeState => storeState.boardModule.filteredBoard)
    const isOpen = useSelector((storeState) => storeState.boardModule.isBoardModalOpen)
    const navigate = useNavigate()

    /*
     * A subtask is not in its group's task list — that is what makes it one.
     * Two entries below used to work on that list and therefore did the wrong
     * thing, silently, when the menu belonged to a subtask: delete rebuilt a
     * group the subtask was never part of and changed nothing, and "new below"
     * got -1 from indexOf and put a top-level task at the head of the group.
     * Both now ask which level they are on.
     */
    const tasksOfGroup = dynamicModalObj.group?.tasks || []
    const parent = tasksOfGroup.find(task =>
        (task.subtasks || []).some(child => child.id === dynamicModalObj.task?.id)) || null
    const isSubtask = Boolean(parent)

    async function onRemoveTask(){
        const title = dynamicModalObj.task?.title
        if(!await confirmDelete({what: title?t('task.deleteName', {title}):t('task.thisTask')})) return
        try {
            // Straight at the task. The server deletes it on either level, and
            // a subtask is not in group.tasks for a diff to notice.
            await removeTaskAction(board, dynamicModalObj.group.id, dynamicModalObj.task.id)
            setDynamicModalObj({...dynamicModalObj, isOpen: false})
        } catch(err) {
            console.error('deleting a task failed', err)
        }
    }

    async function onDuplicateTask(){
        try {
            if(isSubtask){
                // The same story as "new below": duplicateTask looks the task
                // up in group.tasks, does not find a subtask, and appended the
                // copy to the group as a task of its own. A copy of a subtask
                // is a subtask.
                const source = dynamicModalObj.task
                const copy = {
                    ...structuredClone(source),
                    id: utilService.makeId(),
                    title: (source.title || '') + ' (copy)'
                }
                delete copy.comments
                const idx = (parent.subtasks || []).findIndex(c => c.id === source.id)
                await addSubtaskAction(board, dynamicModalObj.group.id, parent.id, copy,
                    idx < 0?null:idx + 1)
            } else {
                await duplicateTask(board, dynamicModalObj.group, dynamicModalObj.task)
            }
            setDynamicModalObj({...dynamicModalObj, isOpen: false})
        } catch(err) {
            console.error('cannot duplicate', err)
        }
    }

    async function onCreateNewTaskBelow(){
        const newTask = {...boardService.getEmptyTask(), id: utilService.makeId(), title: 'New Task'}
        try {
            if(isSubtask){
                // A sibling, not a task in the group: "below" means below THIS
                // row, and this row sits under a parent.
                const idx = (parent.subtasks || []).findIndex(c => c.id === dynamicModalObj.task.id)
                await addSubtaskAction(board, dynamicModalObj.group.id, parent.id, newTask,
                    idx < 0?null:idx + 1)
            } else {
                const idx = tasksOfGroup.findIndex(task => task.id === dynamicModalObj.task.id)
                const updatedTasks = [...tasksOfGroup]
                updatedTasks.splice(idx < 0?updatedTasks.length:idx + 1, 0, newTask)
                await updateGroupAction(board, {...dynamicModalObj.group, tasks: updatedTasks})
            }
            setDynamicModalObj({...dynamicModalObj, isOpen: false})
        } catch(err) {
            console.error('cannot create the task', err)
        }
    }

    /**
     * Take a subtask back out and make it a task of its group.
     *
     * The other direction lives in the selection toolbar, because turning a
     * task into a subtask needs a target to be picked. This one needs nothing
     * — there is exactly one place a subtask can go.
     */
    async function onPromote(){
        try {
            await setTaskParentAction(board, dynamicModalObj.group.id, dynamicModalObj.task.id, null)
            setDynamicModalObj({...dynamicModalObj, isOpen: false})
        } catch(err) {
            console.error('cannot turn the subtask into a task', err)
        }
    }

    /**
     * Create the first subtask of a task.
     *
     * The row only shows its unfold arrow once it HAS children, so this is the
     * way in. Named "New Subtask" straight away rather than opening an input,
     * the same as "Neuen Task darunter" right above it.
     */
    async function onAddSubtask(){
        try {
            await addSubtaskAction(board, dynamicModalObj.group.id, dynamicModalObj.task.id,
                {...boardService.getEmptyTask(), id: utilService.makeId(), title: 'New Subtask'})
            setDynamicModalObj({...dynamicModalObj, isOpen: false})
        } catch(err) {
            console.error('cannot add the subtask', err)
        }
    }

    function onOpenModal(){
        navigate(`/board/${board._id}/${dynamicModalObj.group.id}/${dynamicModalObj.task.id}`)
        setDynamicModalObj({...dynamicModalObj, isOpen: false})
    }

    return (
        <section className="task-menu-modal">
            <div onClick={onOpenModal}>
                <Icon name='expand'/>
                <span>{t('common.open')}</span>
            </div>
            <div onClick={onDuplicateTask}>
                <Icon name='clone' variant='fa-regular'/>
                <span>{t('common.duplicate')}</span>
            </div>
            <div onClick={() => onRemoveTask()}>
                <Icon name='trash-can' variant='fa-regular'/>
                <span>{t('common.delete')}</span>
            </div>
            {!isSubtask && (
                <div onClick={onAddSubtask}>
                    <Icon name='diagram-next'/>
                    <span>{t('task.newSubtask')}</span>
                </div>
            )}
            {isSubtask && (
                <div onClick={onPromote}>
                    <Icon name='arrow-turn-up'/>
                    <span>{t('task.promote')}</span>
                </div>
            )}
            <div onClick={onCreateNewTaskBelow}>
                <Icon name='plus'/>
                <span>{t('task.newBelow')}</span>
            </div>
        </section>
    )
}