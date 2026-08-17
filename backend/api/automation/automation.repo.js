/**
 * Storage access for automations and their run log.
 */
const crypto = require('crypto')
const {db, parseJson, toJson} = require('../../db/knex')

const sid = v => (v === undefined || v === null)?'':String(v)
const newId = () => crypto.randomBytes(12).toString('hex')

/**
 * How many run entries a board keeps.
 *
 * The log grows with every task change on a busy board, and nobody reads past
 * the first screen. `activity` is capped at 40 for the same reason; this one is
 * larger because it is the only way to debug a rule and a single wrong rule can
 * fire dozens of times before it is noticed.
 */
const RUN_LIMIT = 200

function out(row){
    if(!row) return null
    return {
        id: row.id,
        boardId: row.board_id,
        enabled: !!row.enabled,
        trigger: {type: row.trigger_type, ...(parseJson(row.trigger_config, {}) || {})},
        actions: parseJson(row.actions, []) || [],
        createdBy: row.created_by || null,
        createdAt: row.created_at === null?null:Number(row.created_at),
        updatedAt: row.updated_at === null?null:Number(row.updated_at)
    }
}

function outRun(row){
    if(!row) return null
    return {
        id: Number(row.seq),
        boardId: row.board_id,
        automationId: row.automation_id || null,
        taskId: row.task_id || null,
        taskTitle: row.task_title || '',
        outcome: row.outcome,
        summary: row.summary || '',
        createdAt: row.created_at === null?null:Number(row.created_at)
    }
}

/** The rule as columns. `type` lives in its own column, the rest as JSON. */
function toRow(automation){
    const {type, ...config} = automation.trigger || {}
    return {
        board_id: sid(automation.boardId),
        enabled: automation.enabled !== false,
        trigger_type: sid(type),
        trigger_config: toJson(config),
        actions: toJson(Array.isArray(automation.actions)?automation.actions:[])
    }
}

async function findByBoard(boardId){
    const rows = await db()('automation').where({board_id: sid(boardId)}).orderBy('created_at')
    return rows.map(out)
}

/**
 * The rules that could match one event.
 *
 * Filtered in the database rather than in JavaScript because this runs on every
 * single task write. A board with thirty rules and one of them about created
 * items should not read thirty rows to use one.
 */
async function findLive(boardId, triggerType){
    const rows = await db()('automation')
        .where({board_id: sid(boardId), enabled: true, trigger_type: sid(triggerType)})
        .orderBy('created_at')
    return rows.map(out)
}

async function findById(id){
    return out(await db()('automation').where({id: sid(id)}).first())
}

async function insert(automation){
    const id = newId()
    const now = Date.now()
    await db()('automation').insert({
        id, ...toRow(automation),
        created_by: automation.createdBy?sid(automation.createdBy):null,
        created_at: now, updated_at: now
    })
    return await findById(id)
}

async function update(id, patch){
    const row = {updated_at: Date.now()}
    if(patch.trigger || patch.actions){
        Object.assign(row, toRow({
            boardId: patch.boardId, trigger: patch.trigger, actions: patch.actions,
            enabled: patch.enabled
        }))
        // board_id never changes through an update — a rule cannot move house.
        delete row.board_id
    }
    if(typeof patch.enabled === 'boolean') row.enabled = patch.enabled
    await db()('automation').where({id: sid(id)}).update(row)
    return await findById(id)
}

async function deleteById(id){
    await db()('automation').where({id: sid(id)}).del()
}

/* ----------------------------------------------------------- the log -- */

async function addRun(entry){
    await db()('automation_run').insert({
        board_id: sid(entry.boardId),
        automation_id: entry.automationId?sid(entry.automationId):null,
        task_id: entry.taskId?sid(entry.taskId):null,
        task_title: String(entry.taskTitle || '').slice(0, 190),
        outcome: sid(entry.outcome),
        summary: String(entry.summary || '').slice(0, 500),
        created_at: Date.now()
    })

    // Trim to the newest RUN_LIMIT of this board. One extra query per write is
    // the price for a table that cannot grow without bound.
    const oldest = await db()('automation_run')
        .where({board_id: sid(entry.boardId)})
        .orderBy('seq', 'desc').offset(RUN_LIMIT).first('seq')
    if(oldest){
        await db()('automation_run')
            .where({board_id: sid(entry.boardId)}).where('seq', '<=', oldest.seq).del()
    }
}

async function findRuns(boardId, limit = 50){
    const rows = await db()('automation_run')
        .where({board_id: sid(boardId)})
        .orderBy('seq', 'desc')
        .limit(Math.min(Number(limit) || 50, RUN_LIMIT))
    return rows.map(outRun)
}

module.exports = {
    RUN_LIMIT,
    findByBoard, findLive, findById,
    insert, update, deleteById,
    addRun, findRuns
}
