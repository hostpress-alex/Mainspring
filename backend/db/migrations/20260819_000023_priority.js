/**
 * Priorities become one global list.
 *
 * Until now a priority was a label on a board column, stored inside
 * `board_column.settings`, and the value on a task was the label's *title*.
 * Two consequences, both of which this migration exists to end:
 *
 *   - "High" on one board and "High" on another were unrelated strings that
 *     happened to match, so no question could be asked across boards.
 *   - Renaming a label meant rewriting every task that carried the old text.
 *     The editor in the frontend did exactly that, task by task, from the
 *     browser. Globally that would have meant rewriting the whole database
 *     because somebody corrected a spelling.
 *
 * So the value becomes an id, and the id points at a row here. Renaming is
 * then a single UPDATE on one row and no task is touched at all.
 *
 * **Nothing is thrown away.** Every priority title actually in use anywhere
 * is imported into the global list, colour included — including the ones that
 * only ever existed because somebody was testing. A migration that decides on
 * its own which of somebody's data was serious is a migration nobody can
 * trust. Tidying up is a job for the admin screen, which can do it safely
 * because deleting a priority there reassigns the tasks that used it.
 */
const crypto = require('crypto')

const newId = () => 'p_' + crypto.randomBytes(8).toString('hex')

/** The three that ship with the application, if nothing else is found. */
const FALLBACK = [
    {title: 'Low', color: '#ffcb00'},
    {title: 'Medium', color: '#a25ddc'},
    {title: 'High', color: '#e2445c'}
]

const NO_COLOR = '#c4c4c4'

/** MariaDB hands JSON back either packed or already unpacked. */
function parse(value, fallback){
    if(value === null || value === undefined) return fallback
    if(typeof value !== 'string') return value
    try {
        return JSON.parse(value)
    } catch(err) {
        return fallback
    }
}

const key = title => String(title || '').trim().toLowerCase()

exports.up = async function up(knex){
    await knex.schema.createTable('priority', t => {
        t.string('id', 24).notNullable().primary()
        t.string('title', 190).notNullable()
        // '#rrggbbaa' at the longest.
        t.string('color', 9).notNullable().defaultTo(NO_COLOR)
        // The order they are offered in. Not alphabetical: "Low, Medium,
        // High" is the order that means something, and it is not a-b-c.
        t.integer('position').notNullable().defaultTo(0)
        t.bigInteger('created_at').nullable()
    })

    const now = Date.now()

    // Every priority column of every board, with the labels it was using.
    const columns = await knex('board_column').where({type: 'priority'})
        .select('board_id', 'field', 'id', 'settings')
    const boards = await knex('board').select('id', 'labels')
    const boardLabels = new Map(boards.map(b => [b.id, parse(b.labels, []) || []]))

    // title -> {title, color}, first one wins, case-insensitively.
    const found = new Map()
    const remember = label => {
        if(!label || !String(label.title || '').trim()) return
        const k = key(label.title)
        if(found.has(k)) return
        found.set(k, {title: String(label.title).trim(), color: label.color || NO_COLOR})
    }

    // What the columns offered...
    const fieldsByBoard = new Map()
    for(const column of columns){
        const settings = parse(column.settings, {}) || {}
        const labels = Array.isArray(settings.labels)?settings.labels:(boardLabels.get(column.board_id) || [])
        labels.forEach(remember)
        const fields = fieldsByBoard.get(column.board_id) || []
        fields.push(column.field || column.id)
        fieldsByBoard.set(column.board_id, fields)
    }

    // ...and what the tasks actually carry, which is not always the same: a
    // label can be deleted while the value it wrote stays behind.
    const tasks = await knex('task').select('id', 'board_id', 'col_values')
    for(const task of tasks){
        const fields = fieldsByBoard.get(task.board_id)
        if(!fields) continue
        const values = parse(task.col_values, {}) || {}
        for(const field of fields){
            const value = values[field]
            if(typeof value === 'string' && value.trim()) remember({title: value, color: NO_COLOR})
        }
    }

    if(!found.size) FALLBACK.forEach(remember)

    // Keep the familiar order where it is known, everything else behind it.
    const order = FALLBACK.map(f => key(f.title))
    const rows = [...found.values()]
        .sort((a, b) => {
            const ia = order.indexOf(key(a.title)), ib = order.indexOf(key(b.title))
            if(ia !== ib) return (ia < 0?99:ia) - (ib < 0?99:ib)
            return a.title.localeCompare(b.title)
        })
        .map((entry, i) => ({id: newId(), title: entry.title, color: entry.color, position: i, created_at: now}))

    await knex('priority').insert(rows)
    const idByTitle = new Map(rows.map(r => [key(r.title), r.id]))

    // Titles on tasks become ids.
    for(const task of tasks){
        const fields = fieldsByBoard.get(task.board_id)
        if(!fields) continue
        const values = parse(task.col_values, {}) || {}
        let touched = false
        for(const field of fields){
            const value = values[field]
            if(typeof value !== 'string' || !value.trim()) continue
            const id = idByTitle.get(key(value))
            if(!id || id === value) continue
            values[field] = id
            touched = true
        }
        if(touched) await knex('task').where({id: task.id, board_id: task.board_id})
            .update({col_values: JSON.stringify(values)})
    }

    // The per-column label lists are now a copy of something that lives
    // elsewhere, and a copy is a future disagreement. Out.
    for(const column of columns){
        const settings = parse(column.settings, {}) || {}
        if(!Array.isArray(settings.labels)) continue
        delete settings.labels
        await knex('board_column').where({board_id: column.board_id, id: column.id})
            .update({settings: Object.keys(settings).length?JSON.stringify(settings):null})
    }
}

exports.down = async function down(knex){
    const rows = await knex('priority').select('id', 'title', 'color').orderBy('position', 'asc')
    const byId = new Map(rows.map(r => [r.id, r]))

    const columns = await knex('board_column').where({type: 'priority'})
        .select('board_id', 'field', 'id', 'settings')

    const fieldsByBoard = new Map()
    for(const column of columns){
        const fields = fieldsByBoard.get(column.board_id) || []
        fields.push(column.field || column.id)
        fieldsByBoard.set(column.board_id, fields)
    }

    // Ids back to titles.
    const tasks = await knex('task').select('id', 'board_id', 'col_values')
    for(const task of tasks){
        const fields = fieldsByBoard.get(task.board_id)
        if(!fields) continue
        const values = parse(task.col_values, {}) || {}
        let touched = false
        for(const field of fields){
            const row = byId.get(values[field])
            if(!row) continue
            values[field] = row.title
            touched = true
        }
        if(touched) await knex('task').where({id: task.id, board_id: task.board_id})
            .update({col_values: JSON.stringify(values)})
    }

    // Every board gets the whole list back as its column labels. Not what it
    // had before — that is gone — but a working column rather than an empty
    // one, and the backfill in board.service would have rebuilt it anyway.
    const labels = rows.map(r => ({id: r.id, title: r.title, color: r.color}))
    for(const column of columns){
        const settings = parse(column.settings, {}) || {}
        settings.labels = labels
        await knex('board_column').where({board_id: column.board_id, id: column.id})
            .update({settings: JSON.stringify(settings)})
    }

    await knex.schema.dropTableIfExists('priority')
}
