/**
 * Is a column filled in for a task?
 *
 * The table shows every column of the board in every row — that is what a
 * table is for, and an empty cell there still carries meaning because the
 * column above it is labelled. A card has no such header. Repeating "Person",
 * "Status", "Date" on a card with nothing beside them costs a line each and
 * says nothing, so the Kanban card only shows what is actually set.
 *
 * The rules per type are not a formality. `0` is a number somebody entered,
 * `false` is a checkbox left alone, and `updatedBy` exists on every task from
 * the moment it is created but only means something once it carries a date.
 */

/** Where a column reads its value from. Columns predating the rework have no
 *  `field` and fall back to their id. */
export function fieldOf(column){
    return (column && (column.field || column.id)) || ''
}

export function valueOf(column, task){
    return task?task[fieldOf(column)]:undefined
}

export function hasValue(column, task){
    const value = valueOf(column, task)
    if(value === undefined || value === null || value === '') return false

    switch(column?.type){
        // Not "there is an object" but "somebody has touched this task".
        case 'updated':
            return Boolean(value.date)
        // An unticked box is the normal state and not worth a line.
        case 'checkbox':
            return value === true || value === 'true'
        // 0 is a number a person typed in.
        case 'number':
            return true
        default:
            break
    }

    if(Array.isArray(value)) return value.length > 0
    if(typeof value === 'object') return Object.values(value).some(v => v !== '' && v !== null && v !== undefined)
    return true
}

/** The columns a card shows, in board order. */
export function filledColumns(board, task){
    return (board?.columns || []).filter(column => hasValue(column, task))
}
