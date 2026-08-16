import {useEffect, useRef, useState} from 'react'
import {useSelector} from 'react-redux'
import _ from 'lodash'

import {
    duplicateTask, addSubtaskAction, removeTaskAction, moveTasksToGroup,
    setTaskParentAction, loadBoard
} from '../../store/board.actions'
import {confirmDelete} from '../confirm-dialog'
import {ParentPicker} from './parent-picker'
import {utilService} from '../../services/util.service'
import {Icon} from '../icon'
import {t} from '../../i18n'

/**
 * The bar that appears when rows are ticked.
 *
 * The selection can hold tasks and subtasks, and most of the code here is
 * about which of the two, because several actions mean different things per
 * level and two of them are impossible on the wrong one. The rule throughout:
 * an action that cannot apply is left out rather than shown greyed. A row of
 * dead buttons teaches nobody anything, and the reason is never where the
 * cursor happens to be.
 */
export function TaskToolsModal({tasks, group, board, setSelectedTasks, setIsMainCheckbox}){
    // For moving, deliberately the UNfiltered board from the store: if a
    // filtered board is saved, hidden tasks disappear.
    const fullBoard = useSelector(storeState => storeState.boardModule.board) || board
    const [isMoveOpen, setIsMoveOpen] = useState(false)
    const [isConvertOpen, setIsConvertOpen] = useState(false)
    const elMove = useRef()
    const elConvert = useRef()

    useEffect(() => {
        function onDocClick(ev){
            if(elMove.current && !elMove.current.contains(ev.target)) setIsMoveOpen(false)
            if(elConvert.current && !elConvert.current.contains(ev.target)) setIsConvertOpen(false)
        }

        document.addEventListener('mousedown', onDocClick)
        return () => document.removeEventListener('mousedown', onDocClick)
    }, [])

    /* ------------------------------------------------- what is selected -- */

    // A task is top level exactly when it is in the group's task list. That is
    // the whole definition, and it is worth spelling out once here instead of
    // asking `task.subtasks` — a subtask has no such key, but neither would a
    // task the server has not sent children for.
    const topLevelIds = new Set((group.tasks || []).map(task => String(task.id)))
    const parentOf = subtaskId => (group.tasks || []).find(task =>
        (task.subtasks || []).some(child => String(child.id) === String(subtaskId))) || null

    const selected = new Set(tasks.map(task => String(task.id)))
    const subtasks = tasks.filter(task => !topLevelIds.has(String(task.id)))
    const onlyTasks = subtasks.length === 0
    const onlySubtasks = subtasks.length === tasks.length && tasks.length > 0

    // Turning a task into a subtask needs somewhere to put it, and nothing in
    // the selection may have children of its own — those would land on the
    // second level.
    const hasTargets = (fullBoard.groups || [])
        .some(g => (g.tasks || []).some(task => !selected.has(String(task.id))))
    const selectionHasChildren = tasks.some(task => (task.subtasks || []).length > 0)
    const canConvert = onlyTasks && hasTargets && !selectionHasChildren

    // A subtask travels with its parent, so moving one on its own is refused
    // by the server. Not offered here either.
    const canMove = onlyTasks
    const moveTargets = (fullBoard.groups || []).filter(g => g.id !== group.id)

    /* ---------------------------------------------------------- actions -- */

    async function onRemoveTasks(){
        const ok = await confirmDelete({
            what: t('task.selectedCount', {n: tasks.length}),
            button: tasks.length === 1?t('task.delete'):t('task.deleteMany')
        })
        if(!ok) return
        try {
            // One call per task. Rebuilding the group without them, which this
            // used to do, cannot express deleting a subtask: a subtask is not
            // in group.tasks, so the change the server is asked to work out is
            // no change at all and nothing happens.
            for(const task of tasks){
                await removeTaskAction(fullBoard, group.id, task.id)
            }
            reset()
        } catch(err) {
            console.error('deleting failed', err)
            loadBoard(fullBoard._id)
        }
    }

    async function onDuplicateTasks(){
        try {
            for(const task of tasks){
                if(topLevelIds.has(String(task.id))){
                    await duplicateTask(fullBoard, group, task)
                    continue
                }
                // A copy of a subtask is a subtask. duplicateTask looks the
                // source up in group.tasks and would append the copy to the
                // group as a task of its own.
                const parent = parentOf(task.id)
                if(!parent) continue
                const copy = {
                    ...structuredClone(task),
                    id: utilService.makeId(),
                    title: (task.title || '') + ' (copy)'
                }
                delete copy.comments
                await addSubtaskAction(fullBoard, group.id, parent.id, copy)
            }
            reset()
        } catch(err) {
            console.error('duplicating failed', err)
            loadBoard(fullBoard._id)
        }
    }

    /**
     * Hang the selection under another task, or take it back out.
     *
     * One after the other rather than in parallel: every call rewrites the
     * positions of two lists and answers with the whole board, so two in
     * flight would write over each other's ordering.
     */
    async function onSetParent(parentId){
        setIsConvertOpen(false)
        try {
            for(const task of tasks){
                await setTaskParentAction(fullBoard, group.id, task.id, parentId)
            }
            reset()
        } catch(err) {
            console.error('converting failed', err)
            // Half the selection may already have moved — reload rather than
            // guess what got through.
            loadBoard(fullBoard._id)
        }
    }

    async function onMoveTo(targetGroupId){
        setIsMoveOpen(false)
        try {
            const taskIds = tasks.map(task => task.id)
            if(!taskIds.length) return
            await moveTasksToGroup(fullBoard._id, taskIds, group.id, targetGroupId)
            loadBoard(fullBoard._id)
            reset()
        } catch(err) {
            console.error('moving a task failed', err)
        }
    }

    function reset(){
        setSelectedTasks([])
        setIsMainCheckbox({isActive: false})
    }

    return (
        <section className="task-tools-modal flex">
            <div className="task-tools flex">
                <div className="task-count">
                    {tasks.length}
                </div>
                <div className="tasks-container flex">
                    <div className="task-info flex">
                        <span>{t('task.selectedLabel', {n: tasks.length})}</span>
                        <div className="group-color flex">
                            {_.times(tasks.length, () =>
                                <Icon name='circle' key={_.uniqueId('KEY_')} className="icon" style={{'--group-color': group.color}}/>)}
                        </div>
                    </div>
                    <div className="task-btns flex">
                        <div onClick={onDuplicateTasks}>
                            <Icon name='clone' variant='fa-regular' className="icon"/>
                            {t('common.duplicate')}
                        </div>
                        <div onClick={onRemoveTasks}>
                            <Icon name='trash-can' variant='fa-regular' className="icon"/>
                            {t('common.delete')}
                        </div>

                        {canConvert && (
                            <div ref={elConvert} className="move-to" onClick={() => setIsConvertOpen(open => !open)} title={t('task.convertTitle')}>
                                <Icon name='diagram-next' className="icon"/>
                                {t('task.convert')}
                                {isConvertOpen && (
                                    <ParentPicker
                                        board={fullBoard}
                                        excludeIds={tasks.map(task => task.id)}
                                        onPick={parent => onSetParent(parent.id)}
                                        onClose={() => setIsConvertOpen(false)}
                                    />
                                )}
                            </div>
                        )}

                        {/* No picker: there is exactly one place a subtask can go. */}
                        {onlySubtasks && (
                            <div onClick={() => onSetParent(null)} title={t('task.promote')}>
                                <Icon name='arrow-turn-up' className="icon"/>
                                {t('task.promote')}
                            </div>
                        )}

                        {canMove && (
                            <div ref={elMove} className={`move-to${moveTargets.length?'':' is-disabled'}`} onClick={() => moveTargets.length && setIsMoveOpen(open => !open)} title={moveTargets.length?t('task.moveToTitle'):t('task.noOtherGroup')}>
                                <Icon name='circle-arrow-right' className="icon"/>
                                {t('task.moveTo')}
                                {isMoveOpen && (
                                    <ul className="move-to-list" onClick={ev => ev.stopPropagation()}>
                                        <li className="move-to-head">{t('task.moveTo')}</li>
                                        {moveTargets.map(g => (
                                            <li key={g.id} className="move-to-item" onClick={() => onMoveTo(g.id)}>
                                                <Icon name='circle' className="move-to-dot" style={{'--group-color': g.color}}/>
                                                <span className="move-to-name">{g.title}</span>
                                                <span className="move-to-count">{(g.tasks || []).length}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="close-btn" onClick={reset}>
                        <Icon name='xmark' className="icon"/>
                    </div>
                </div>
            </div>
        </section>
    )
}
