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

/* ------------------------------------------------------------ subtasks -- */

/**
 * How far the children of a task have got, as the short string on the row.
 *
 * "Done" is not guessed. A board like "wtf / yea / lol" has no label that
 * looks finished, and picking the last one or matching the word "done" would
 * be right on some boards and quietly wrong on others. A label says so itself:
 * `done: true`, set in the label editor.
 *
 * With no label marked, the counter falls back to the plain number of
 * children. That is honest — it shows what is actually known — and it is why
 * this returns a string rather than a pair of numbers.
 *
 * Returns null when there is nothing to say, so the caller can leave the
 * counter off entirely rather than print a zero.
 */
export function subtaskProgress(board, task){
    const subtasks = task && task.subtasks
    if(!Array.isArray(subtasks) || !subtasks.length) return null

    const doneByColumn = (board?.columns || [])
        .map(column => [column, new Set((column.labels || []).filter(l => l && l.done).map(l => l.title))])
        .filter(([, titles]) => titles.size)

    if(!doneByColumn.length) return String(subtasks.length)

    const done = subtasks.filter(sub =>
        doneByColumn.some(([column, titles]) => titles.has(sub[fieldOf(column)]))).length
    return `${done}/${subtasks.length}`
}
