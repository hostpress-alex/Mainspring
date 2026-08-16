import {useState} from 'react'

import {TaskPreview} from './task-preview'
import {addSubtaskAction} from '../../store/board.actions'
import {widthOf, widthStyle, TASK_COLUMN} from '../board/column-width'
import {boardService} from '../../services/board.service'
import {utilService} from '../../services/util.service'
import {t} from '../../i18n'
import './subtask.css'

/**
 * The children of one task, as rows underneath it.
 *
 * Every row is a `TaskPreview`, the same component the task above uses. That
 * is deliberate and was learned the hard way: a row rebuilt here looked close
 * for about a day and then had a cell missing, lost the picker styles that
 * hang off `.task-preview`, and lined up with nothing. A subtask *is* a task,
 * so it renders as one — the indent is the only difference, and it comes from
 * a class.
 *
 * Everything a task row can do therefore works here without being wired up
 * again: opening the dialog, the menu, comments, every picker, the column
 * widths, and being ticked into the selection. This component only adds the
 * one thing a task row has no reason to know about — how a new child is
 * created.
 */
export function SubtaskRows({task, group, board, widths, handleCheckboxChange, selectedIds}){
    const [draft, setDraft] = useState('')
    const [isAdding, setIsAdding] = useState(false)

    async function onAdd(ev){
        ev.preventDefault()
        const title = draft.trim()
        if(!title || isAdding) return
        setIsAdding(true)
        try {
            await addSubtaskAction(board, group.id, task.id,
                {...boardService.getEmptyTask(), id: utilService.makeId(), title})
            setDraft('')
        } catch(err) {
            console.error('cannot add the subtask', err)
        } finally {
            setIsAdding(false)
        }
    }

    return (
        <div className="subtask-rows">
            {(task.subtasks || []).map(subtask => (
                <TaskPreview
                    key={subtask.id}
                    task={subtask}
                    group={group}
                    board={board}
                    widths={widths}
                    handleCheckboxChange={handleCheckboxChange}
                    isSelected={Boolean(selectedIds && selectedIds.has(String(subtask.id)))}
                    isSubtask
                />
            ))}

            <form className="subtask-add flex" onSubmit={onAdd}>
                <div className="sticky-div" style={{'--group-color': group.color}}>
                    <div className="hidden"></div>
                    <div className="check-box">
                        <input type="checkbox" disabled/>
                    </div>
                    {/* The same width the task title has, so the input ends
                        where the first column begins. */}
                    <div className="subtask-add-title" style={widthStyle(widthOf(widths, TASK_COLUMN))}>
                        <input
                            type="text"
                            value={draft}
                            placeholder={t('task.addSubtask')}
                            onChange={ev => setDraft(ev.target.value)}
                            onBlur={onAdd}
                        />
                    </div>
                </div>
                <div className="empty-div"></div>
            </form>
        </div>
    )
}
