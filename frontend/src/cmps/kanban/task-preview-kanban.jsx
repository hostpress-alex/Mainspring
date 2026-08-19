import {Fragment} from 'react'
import {useSelector} from 'react-redux'

import {updateTaskAction} from '../../store/board.actions'
import {touchedBy} from '../../services/updated-by'
import {DynamicCmp} from '../task/task-preview'
import {filledColumns} from '../board/column-value'
import * as boardRoles from '../../services/board-roles'

/**
 * The body of a Kanban card: the columns that are filled in, as label/value
 * pairs.
 *
 * It used to be the table row turned on its side. `task-list-kanban` rendered
 * one list of all column *titles* and this component rendered a second list of
 * all column *values* beside it, both carrying the pixel widths of the table.
 * Two independent stacks: they only lined up while every label box happened to
 * be exactly as tall as its value, and the labels were fixed at 36px while the
 * values were not. The drift added up down the card, which is what it looked
 * like.
 *
 * Both lists are one grid now. Label and value are siblings in the same grid
 * row, so they cannot come apart no matter how tall a value grows, and the
 * label column is as wide as the longest label instead of as wide as the
 * table.
 *
 * Empty columns are left out — see column-value.js for why.
 */
export function TaskPreviewKanban({task, group, board}){
    const user = useSelector(storeState => storeState.userModule.user)
    const columns = filledColumns(board, task)
    // The same rule as in the table: a viewer reads the card and changes
    // nothing on it.
    const canWork = boardRoles.canEdit(board, user)

    async function updateTask(cmpType, data, activity){
        // A copy, never the task from the store. updateTaskAction works out
        // what changed by comparing against the state it holds — writing into
        // that state first means the comparison finds nothing and the change
        // is never sent. The table row has always cloned here; the Kanban card
        // did not, which is why editing a card looked like it worked and was
        // gone after a reload.
        if(!canWork) return
        const next = structuredClone(task)
        next[cmpType] = data
        next.updatedBy = touchedBy(next, user)
        try {
            await updateTaskAction(board, group.id, next, activity)
        } catch(err) {
            console.error('cannot save the task', err)
        }
    }

    if(!columns.length) return null
    return (
        <dl className="kanban-fields">
            {columns.map(column => (
                <Fragment key={column.id}>
                    <dt className="kanban-field-label" title={column.title}>{column.title}</dt>
                    <dd className="kanban-field-value">
                        <DynamicCmp column={column} board={board} info={task} onUpdate={updateTask} readOnly={!canWork}/>
                    </dd>
                </Fragment>
            ))}
        </dl>
    )
}
