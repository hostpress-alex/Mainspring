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

export function TaskToolsModal({ tasks, group, board, setSelectedTasks, setIsMainCheckbox }) {
    // Fuer das Verschieben bewusst das UNgefilterte Board aus dem Store: wird
    // ein gefiltertes Board gespeichert, verschwinden ausgeblendete Tasks.
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
            was: tasks.length === 1 ? 'Der markierte Task' : `${tasks.length} markierte Tasks`,
            knopf: tasks.length === 1 ? 'Task löschen' : 'Tasks löschen',
        })
        if (!ok) return
        try {
            // Bewusst EIN Aufruf mit dem Endstand: die Schleife von frueher
            // schickte mehrere Aenderungen los, die alle vom selben veralteten
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
     * Verschiebt die markierten Tasks in eine andere Gruppe desselben Boards.
     * Jeder Task wird einzeln verschoben — der Server haengt ihn hinten an
     * die Zielgruppe und nimmt ihn aus der Quellgruppe heraus.
     */
    async function onMoveTo(targetGroupId) {
        setIsMoveOpen(false)
        try {
            const taskIds = tasks.map(t => t.id)
            if (!taskIds.length) return
            await moveTasksToGroup(fullBoard._id, taskIds, group.id, targetGroupId)
            loadBoard(fullBoard._id)
            reset()
        } catch (err) {
            console.log('Verschieben fehlgeschlagen', err)
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
                        <span>Task ausgewählt</span>
                        <div className="group-color flex">
                            {_.times(tasks.length, () => <BsFillCircleFill key={_.uniqueId('KEY_')} className="icon" style={{ color: group.color }} />)}
                        </div>
                    </div>
                    <div className="task-btns flex">
                        <div onClick={onDuplicateTasks}>
                            <HiOutlineDocumentDuplicate className="icon" />
                            Duplicate
                        </div>
                        <div onClick={onRemoveTasks}>
                            <FiTrash className="icon" />
                            Delete
                        </div>
                        <div ref={elMove} style={{ position: 'relative' }}
                            onClick={() => targets.length && setIsMoveOpen(open => !open)}
                            title={targets.length ? 'In eine andere Gruppe verschieben' : 'Es gibt keine andere Gruppe'}
                            className={targets.length ? '' : 'is-disabled'}>
                            <BsArrowRightCircle className="icon" />
                            Move to
                            {isMoveOpen && (
                                <ul style={{
                                    position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, zIndex: 60,
                                    background: '#fff', color: '#323338', minWidth: 210, borderRadius: 8,
                                    boxShadow: '0 6px 22px rgba(0,0,0,.25)', padding: 6, listStyle: 'none',
                                    maxHeight: 260, overflow: 'auto', textAlign: 'left',
                                }} onClick={ev => ev.stopPropagation()}>
                                    <li style={{ padding: '4px 10px', fontSize: 12, color: '#676879' }}>Verschieben nach</li>
                                    {targets.map(g => (
                                        <li key={g.id}
                                            onClick={() => onMoveTo(g.id)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                                                borderRadius: 6, cursor: 'pointer' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f0f4ff'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <BsFillCircleFill style={{ color: g.color, fontSize: 10, flexShrink: 0 }} />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {g.title}
                                            </span>
                                            <span style={{ marginLeft: 'auto', color: '#676879', fontSize: 12 }}>
                                                {(g.tasks || []).length}
                                            </span>
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
