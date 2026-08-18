/**
 * Saved filters of a board.
 */
const crypto = require('crypto')
const {db, parseJson, toJson} = require('../../db/knex')

const sid = v => (v === undefined || v === null)?'':String(v)
const newId = () => crypto.randomBytes(12).toString('hex')

/** The ways a board can be drawn. Anything else falls back to the table. */
const DISPLAYS = ['table', 'kanban', 'dashboard']

function out(row){
    if(!row) return null
    return {
        id: row.id,
        boardId: row.board_id,
        title: row.title || '',
        mode: row.mode || 'all',
        display: row.display || 'table',
        visibility: row.visibility === 'board'?'board':'private',
        rules: parseJson(row.rules, []) || [],
        createdBy: row.created_by || null,
        createdAt: row.created_at === null?null:Number(row.created_at),
        updatedAt: row.updated_at === null?null:Number(row.updated_at)
    }
}

/**
 * The tabs somebody may see on a board: the shared ones, plus their own.
 *
 * Filtered in the query rather than after it. A list that comes back whole
 * and is then trimmed in the service is one forgotten call away from showing
 * everybody everybody else's tabs.
 */
async function findByBoard(boardId, userId){
    const rows = await db()('board_view')
        .where({board_id: sid(boardId)})
        .andWhere(q => q.where('visibility', 'board').orWhere('created_by', sid(userId)))
        .orderBy('created_at')
    return rows.map(out)
}

async function findById(id){
    return out(await db()('board_view').where({id: sid(id)}).first())
}

async function insert(view){
    const id = newId()
    const now = Date.now()
    await db()('board_view').insert({
        id,
        board_id: sid(view.boardId),
        title: String(view.title || '').slice(0, 190),
        mode: view.mode === 'any'?'any':'all',
        display: DISPLAYS.includes(view.display)?view.display:'table',
        visibility: view.visibility === 'board'?'board':'private',
        rules: toJson(Array.isArray(view.rules)?view.rules:[]),
        created_by: view.createdBy?sid(view.createdBy):null,
        created_at: now,
        updated_at: now
    })
    return await findById(id)
}

async function update(id, patch){
    const row = {updated_at: Date.now()}
    if(patch.title !== undefined) row.title = String(patch.title || '').slice(0, 190)
    if(patch.mode !== undefined) row.mode = patch.mode === 'any'?'any':'all'
    if(patch.display !== undefined) row.display = DISPLAYS.includes(patch.display)?patch.display:'table'
    if(patch.visibility !== undefined) row.visibility = patch.visibility === 'board'?'board':'private'
    if(patch.rules !== undefined) row.rules = toJson(Array.isArray(patch.rules)?patch.rules:[])
    await db()('board_view').where({id: sid(id)}).update(row)
    return await findById(id)
}

async function deleteById(id){
    await db()('board_view').where({id: sid(id)}).del()
}

module.exports = {findByBoard, findById, insert, update, deleteById}
