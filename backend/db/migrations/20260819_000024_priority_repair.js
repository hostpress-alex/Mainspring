/**
 * Clean up priority values that point at nothing.
 *
 * The migration before this one turned priority titles into ids. On this
 * installation it left values behind that name a priority which is not in the
 * table — most likely because it was run more than once against the same
 * database, so the ids written into the tasks came from one pass and the rows
 * that survived came from another.
 *
 * There is no honest way to guess what those values used to say: the title
 * they were made from is gone with the row. So they are cleared, and the
 * number of them is written to the log. An empty priority cell is visibly
 * empty; a cell pointing at a deleted row looks like a value and behaves like
 * a bug — and every list, filter and count silently disagrees about it.
 *
 * This is also why the same value can no longer be written through the API:
 * `_checkColumnValues` in board.service refuses a priority that is not in the
 * table, so nothing can put the database back into this state.
 */
function parse(value, fallback){
    if(value === null || value === undefined) return fallback
    if(typeof value !== 'string') return value
    try {
        return JSON.parse(value)
    } catch(err) {
        return fallback
    }
}

exports.up = async function up(knex){
    const known = new Set((await knex('priority').select('id')).map(r => r.id))

    const columns = await knex('board_column').where({type: 'priority'}).select('board_id', 'id', 'field')
    if(!columns.length) return

    const fieldsByBoard = new Map()
    for(const column of columns){
        const list = fieldsByBoard.get(column.board_id) || []
        list.push(column.field || column.id)
        fieldsByBoard.set(column.board_id, list)
    }

    const tasks = await knex('task')
        .whereIn('board_id', [...fieldsByBoard.keys()])
        .select('id', 'board_id', 'col_values')

    let cleared = 0
    for(const task of tasks){
        const values = parse(task.col_values, {}) || {}
        let touched = false
        for(const field of fieldsByBoard.get(task.board_id) || []){
            const value = values[field]
            if(value === null || value === undefined || value === '') continue
            if(known.has(value)) continue
            values[field] = ''
            touched = true
            cleared++
        }
        if(touched) await knex('task').where({id: task.id, board_id: task.board_id})
            .update({col_values: JSON.stringify(values)})
    }

    if(cleared) console.log(`priority repair: cleared ${cleared} value(s) that pointed at a priority that does not exist`)
}

/**
 * Nothing to undo.
 *
 * The values this removed named rows that were not there; putting the empty
 * string back would not restore an answer, it would restore a dangling
 * pointer. Deliberately a no-op rather than a lie.
 */
exports.down = async function down(){
}
