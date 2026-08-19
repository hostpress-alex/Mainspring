/**
 * Storage access for the global priority list.
 *
 * Two kinds of work live here: four plain reads and writes on a very small
 * table, and the awkward part — finding out which tasks carry a priority.
 * A task's column values sit in one JSON blob (`task.col_values`), keyed by
 * the *field* of the column, and which field that is differs per board. So
 * "who uses this priority" cannot be a WHERE clause; it is a lookup of the
 * priority columns first, then a pass over the tasks of those boards.
 *
 * That is affordable because it is asked in exactly two places, both of them
 * rare and both of them by an admin: the usage counts in the admin screen,
 * and the reassignment when a priority is deleted.
 */
const crypto = require('crypto')
const {db, parseJson, toJson} = require('../../db/knex')

const sid = v => (v === undefined || v === null)?'':String(v)
const newId = () => 'p_' + crypto.randomBytes(8).toString('hex')

function out(row){
    if(!row) return null
    return {
        id: row.id,
        title: row.title || '',
        color: row.color || '#c4c4c4',
        position: Number(row.position) || 0,
        createdAt: row.created_at === null || row.created_at === undefined?null:Number(row.created_at)
    }
}

/* ------------------------------------------------------------- reading -- */

async function findAll(){
    const rows = await db()('priority').orderBy([{column: 'position'}, {column: 'title'}])
    return rows.map(out)
}

async function findById(id){
    return out(await db()('priority').where({id: sid(id)}).first())
}

/** Same title, ignoring case — the check that stops two "High"s. */
async function findByTitle(title, exceptId = null){
    let q = db()('priority').whereRaw('LOWER(title) = ?', [String(title || '').trim().toLowerCase()])
    if(exceptId) q = q.whereNot({id: sid(exceptId)})
    return out(await q.first())
}

/* ------------------------------------------------------------- writing -- */

async function insert({title, color}){
    const row = await db()('priority').max({m: 'position'}).first()
    const id = newId()
    await db()('priority').insert({
        id, title, color,
        position: (Number(row && row.m) || 0) + 1,
        created_at: Date.now()
    })
    return await findById(id)
}

async function update(id, patch){
    const fields = {}
    if(patch.title !== undefined) fields.title = patch.title
    if(patch.color !== undefined) fields.color = patch.color
    if(!Object.keys(fields).length) return await findById(id)
    await db()('priority').where({id: sid(id)}).update(fields)
    return await findById(id)
}

/** The order given is the order stored; anything not named keeps its place. */
async function reorder(ids){
    await db().transaction(async trx => {
        for(let i = 0; i < ids.length; i++){
            await trx('priority').where({id: sid(ids[i])}).update({position: i})
        }
    })
}

/* --------------------------------------------------------------- usage -- */

/**
 * Which field holds a priority, per board.
 *
 * A board can have more than one priority column, and each has its own field.
 */
async function fieldsByBoard(trx = null){
    const q = (trx || db())('board_column').where({type: 'priority'}).select('board_id', 'id', 'field')
    const rows = await q
    const map = new Map()
    for(const row of rows){
        const list = map.get(row.board_id) || []
        list.push(row.field || row.id)
        map.set(row.board_id, list)
    }
    return map
}

/**
 * Every task that carries a priority, as {id, boardId, values, fields}.
 *
 * Read once and reused by both callers, because both need the same pass.
 */
async function tasksWithPriority(trx = null){
    const map = await fieldsByBoard(trx)
    if(!map.size) return []
    const rows = await (trx || db())('task')
        .whereIn('board_id', [...map.keys()])
        .select('id', 'board_id', 'col_values')
    return rows.map(row => ({
        id: row.id,
        boardId: row.board_id,
        fields: map.get(row.board_id) || [],
        values: parseJson(row.col_values, {}) || {}
    }))
}

/** {priorityId: numberOfTasks} — everything the admin screen needs at once. */
async function usage(){
    const counts = {}
    for(const task of await tasksWithPriority()){
        for(const field of task.fields){
            const value = task.values[field]
            if(typeof value !== 'string' || !value) continue
            counts[value] = (counts[value] || 0) + 1
        }
    }
    return counts
}

/**
 * Delete a priority and move everything that used it onto another one.
 *
 * Both halves in one transaction: a priority that is gone while tasks still
 * point at it shows up as an empty cell nobody can explain.
 */
async function removeWithReassign(id, toId){
    let moved = 0
    await db().transaction(async trx => {
        const tasks = await tasksWithPriority(trx)
        for(const task of tasks){
            let touched = false
            for(const field of task.fields){
                if(task.values[field] !== id) continue
                task.values[field] = toId
                touched = true
            }
            if(!touched) continue
            await trx('task').where({id: task.id, board_id: task.boardId})
                .update({col_values: toJson(task.values)})
            moved++
        }
        await trx('priority').where({id: sid(id)}).del()
    })
    return moved
}

module.exports = {
    findAll, findById, findByTitle,
    insert, update, reorder,
    usage, removeWithReassign,
    // exported for the value check in board.service
    fieldsByBoard
}
