/**
 * Storage access for time entries.
 *
 * One row is one interval. Nothing in here knows about permissions or about
 * the rule that only one timer may run — that is the service's job.
 */
const crypto = require('crypto')
const {db} = require('../../db/knex')

const sid = v => (v === undefined || v === null)?'':String(v)
const newId = () => crypto.randomBytes(12).toString('hex')

const COLUMNS = [
    'id', 'board_id', 'task_id', 'user_id',
    'started_at', 'ended_at', 'note', 'source', 'ended_by',
    'created_at', 'updated_at'
]

function out(row){
    if(!row) return null
    return {
        id: row.id,
        boardId: row.board_id,
        taskId: row.task_id,
        userId: row.user_id,
        startedAt: Number(row.started_at),
        endedAt: row.ended_at === null || row.ended_at === undefined?null:Number(row.ended_at),
        note: row.note || '',
        source: row.source || 'timer',
        endedBy: row.ended_by || null,
        createdAt: row.created_at === null?null:Number(row.created_at),
        updatedAt: row.updated_at === null?null:Number(row.updated_at)
    }
}

/* ------------------------------------------------------------- reading -- */

async function findById(id){
    const row = await db()('task_time').where({id: sid(id)}).first(COLUMNS)
    return out(row)
}

/** The one interval this person has open, or null. */
async function findRunning(userId){
    const row = await db()('task_time')
        .where({user_id: sid(userId)})
        .whereNull('ended_at')
        .orderBy('started_at', 'desc')
        .first(COLUMNS)
    return out(row)
}

/** Every open interval, whoever it belongs to — for closing forgotten ones. */
async function findAllRunning(){
    const rows = await db()('task_time').whereNull('ended_at').select(COLUMNS)
    return rows.map(out)
}

/** Everything on one task, oldest first: this is a history, so it reads down. */
async function findForTask(boardId, taskId){
    const rows = await db()('task_time')
        .where({board_id: sid(boardId), task_id: sid(taskId)})
        .orderBy('started_at', 'asc')
        .select(COLUMNS)
    return rows.map(out)
}

/**
 * Totals per task for a whole board, in one query.
 *
 * The board sends one number per task to the table view. Reading every
 * interval to add them up in JavaScript would be a few thousand rows for a
 * board that has been in use for a while.
 */
async function totalsForBoard(boardId){
    const rows = await db()('task_time')
        .where({board_id: sid(boardId)})
        .whereNotNull('ended_at')
        .groupBy('task_id')
        .select('task_id')
        .sum({ms: db().raw('ended_at - started_at')})
    const totals = {}
    for(const row of rows) totals[row.task_id] = Number(row.ms) || 0
    return totals
}

/* ------------------------------------------------------------- writing -- */

async function insert(entry){
    const now = Date.now()
    const row = {
        id: entry.id || newId(),
        board_id: sid(entry.boardId),
        task_id: sid(entry.taskId),
        user_id: sid(entry.userId),
        started_at: entry.startedAt,
        ended_at: entry.endedAt === undefined?null:entry.endedAt,
        note: entry.note || null,
        source: entry.source || 'timer',
        ended_by: entry.endedBy || null,
        created_at: now,
        updated_at: now
    }
    await db()('task_time').insert(row)
    return out(row)
}

async function update(id, patch){
    const row = {updated_at: Date.now()}
    if(patch.startedAt !== undefined) row.started_at = patch.startedAt
    if(patch.endedAt !== undefined) row.ended_at = patch.endedAt
    if(patch.note !== undefined) row.note = patch.note || null
    if(patch.endedBy !== undefined) row.ended_by = patch.endedBy || null
    await db()('task_time').where({id: sid(id)}).update(row)
    return await findById(id)
}

async function remove(id){
    await db()('task_time').where({id: sid(id)}).del()
}

/* -------------------------------------------------------- board access -- */

/**
 * One person's role on one board, without assembling the board.
 *
 * Lives in board.repo now, because reactions ask the same question and two
 * copies of a permission lookup is one copy too many.
 */
const roleOnBoard = (boardId, userId) => require('../board/board.repo').roleOnBoard(boardId, userId)

/**
 * Does this task exist on this board, what is it called, and where does it sit.
 *
 * The group comes along because the running timer has to be clickable: the
 * route to a task is /board/:boardId/:groupId/:taskId, and without the group
 * the only place the indicator could send somebody is the board.
 */
async function taskLocation(boardId, taskId){
    const row = await db()('task')
        .where({board_id: sid(boardId), id: sid(taskId)})
        .first('title', 'group_id')
    if(!row) return null
    return {title: row.title || '', groupId: row.group_id || null}
}

module.exports = {
    findById, findRunning, findAllRunning, findForTask, totalsForBoard,
    insert, update, remove,
    roleOnBoard, taskLocation,
    newId
}
