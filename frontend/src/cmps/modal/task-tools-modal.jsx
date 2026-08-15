import { useEffect, useRef, useState } from "react"
import { useSelector } from "react-redux"

import { duplicateTask, updateGroupAction, moveTasksToGroup, loadBoard } from "../../store/board.actions"
import { confirmDelete } from "../confirm-dialog"

import { HiOutlineDocumentDuplicate } from "react-icons/hi"
import { FiTrash } from "react-icons/fi"
import { IoCloseOutline } from "react-icons/io5"
import { BsArrowRightCircle } from "react-icons/bs"
import { BsFillCircleFill } from 'react-icons/bs'
import _ from 'lodash'
import { t } from '../../i18n'

export function TaskToolsModal({ tasks, group, board, setSelectedTasks, setIsMainCheckbox }) {
    // For moving, deliberately the UNfiltered board from the store: if a
    // filtered board is saved, hidden tasks disappear.
    const fullBoard = useSelector(storeState => storeState.boardModule.board) || board
    const [isMoveOpen, setIsMoveOpen] = useState(false)
    const elMove = useRef()

    useEffect(() => {
        function onDocClick(ev) {
            if (elMove.current && !elMove.current.contains(ev.target)) setIsMoveOpen(false)
        }
        document.addEventListener('mousedown', onDocClick)
        return () => document.removeEventListener('mousedown', onDocClick)
    }, [])

    async function onRemoveTasks() {
        const ok = await confirmDelete({
            what: t('task.selectedCount', { n: tasks.length }),
            button: tasks.length === 1 ? t('task.delete') : t('task.deleteMany'),
        })
        if (!ok) return
        try {
            // Deliberately ONE call with the final state: the loop this used to be
            // fired off several changes that all started from the same stale
            // Stand ausgingen.
            const ids = new Set(tasks.map(task => task.id))
            await updateGroupAction(board, {
                ...group,
                tasks: (group.tasks || []).filter(task => !ids.has(task.id))
            })
            reset()
        } catch (err) {
            console.error(err)
        }
    }

    async function onDuplicateTasks() {
        try {
            tasks.forEach(task => duplicateTask(board, group, task))
            reset()
        } catch (err) {
            console.log(err)
        }
    }

    /**
     * Moves the selected tasks into another group of the same board. Each task
     * is moved on its own — the server appends it to the target group and
     * takes it out of the source group.
     */
    async function onMoveTo(targetGroupId) {
        setIsMoveOpen(false)
        try {
            const taskIds = tasks.map(task => task.id)
            if (!taskIds.length) return
            await moveTasksToGroup(fullBoard._id, taskIds, group.id, targetGroupId)
            loadBoard(fullBoard._id)
            reset()
        } catch (err) {
            console.log('moving a task failed', err)
        }
    }

    function reset() {
        setSelectedTasks([])
        setIsMainCheckbox({ isActive: false })
    }

    const targets = (fullBoard.groups || []).filter(g => g.id !== group.id)

    return (
        <section className="task-tools-modal flex">
            <div className="task-tools flex">
                <div className="task-count">
                    {tasks.length}
                </div>
                <div className="tasks-container flex">
                    <div className="task-info flex">
                        <span>{t('task.selectedLabel', { n: tasks.length })}</span>
                        <div className="group-color flex">
                            {_.times(tasks.length, () => <BsFillCircleFill key={_.uniqueId('KEY_')} className="icon" style={{ '--group-color': group.color }} />)}
                        </div>
                    </div>
                    <div className="task-btns flex">
                        <div onClick={onDuplicateTasks}>
                            <HiOutlineDocumentDuplicate className="icon" />
                            {t('common.duplicate')}
                        </div>
                        <div onClick={onRemoveTasks}>
                            <FiTrash className="icon" />
                            {t('common.delete')}
                        </div>
                        <div ref={elMove} className={`move-to${targets.length ? '' : ' is-disabled'}`}
                            onClick={() => targets.length && setIsMoveOpen(open => !open)}
                            title={targets.length ? t('task.moveToTitle') : t('task.noOtherGroup')}>
                            <BsArrowRightCircle className="icon" />
                            {t('task.moveTo')}
                            {isMoveOpen && (
                                <ul className="move-to-list" onClick={ev => ev.stopPropagation()}>
                                    <li className="move-to-head">{t('task.moveTo')}</li>
                                    {targets.map(g => (
                                        <li key={g.id} className="move-to-item"
                                            onClick={() => onMoveTo(g.id)}>
                                            <BsFillCircleFill className="move-to-dot" style={{ '--group-color': g.color }} />
                                            <span className="move-to-name">{g.title}</span>
                                            <span className="move-to-count">{(g.tasks || []).length}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                    <div className="close-btn" onClick={reset}>
                        <IoCloseOutline className="icon" />
                    </div>
                </div>
            </div>
        </section>
    )
}
