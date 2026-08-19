/**
 * Storage access for working hours, and the three numbers they are compared
 * against.
 *
 * The comparisons live here rather than in the service because each of them
 * is one grouped query over a table this feature does not own — planned time
 * (`schedule`), recorded time (`task_time`) and the estimates that sit in the
 * tasks' JSON. Doing them in SQL keeps a week's summary at four round trips
 * instead of loading three tables into memory to add them up.
 */
const {db, parseJson} = require('../../db/knex')

const sid = v => (v === undefined || v === null)?'':String(v)

function out(row){
    return {
        weekday: Number(row.weekday),
        startMin: Number(row.start_min),
        endMin: Number(row.end_min),
        breakMin: Number(row.break_min) || 0
    }
}

async function findForUser(userId){
    const rows = await db()('work_hours').where({user_id: sid(userId)}).orderBy('weekday', 'asc')
    return rows.map(out)
}

/** Everybody's, keyed by user — for the admin screen and for capacity views. */
async function findForUsers(userIds){
    const ids = [...new Set((userIds || []).map(sid).filter(Boolean))]
    if(!ids.length) return {}
    const rows = await db()('work_hours').whereIn('user_id', ids).orderBy(['user_id', 'weekday'])
    const byUser = {}
    for(const row of rows){
        (byUser[row.user_id] = byUser[row.user_id] || []).push(out(row))
    }
    return byUser
}

/**
 * The whole week at once, replaced.
 *
 * Not seven separate writes: a week is one statement about how somebody
 * works, and saving it in pieces means a moment where Tuesday has been
 * changed and Wednesday has not — which is exactly the moment a capacity
 * number is read and disbelieved.
 */
async function replaceForUser(userId, days){
    await db().transaction(async trx => {
        await trx('work_hours').where({user_id: sid(userId)}).del()
        if(!days.length) return
        await trx('work_hours').insert(days.map(d => ({
            user_id: sid(userId),
            weekday: d.weekday,
            start_min: d.startMin,
            end_min: d.endMin,
            break_min: d.breakMin || 0
        })))
    })
    return await findForUser(userId)
}

/* ------------------------------------------------------- what happened -- */

/** Planned time (the calendar's own entries) inside a window, in minutes. */
async function plannedMinutes(userId, from, to){
    const row = await db()('schedule')
        .where({user_id: sid(userId)})
        .where('start_at', '<', to).where('end_at', '>', from)
        .select(db().raw('COALESCE(SUM(TIMESTAMPDIFF(MINUTE, start_at, end_at)), 0) AS m'))
        .first()
    return Number((row && row.m) || 0)
}

/**
 * Recorded time inside a window, in minutes.
 *
 * Running entries are left out — the same rule the totals in the board use.
 * An interval that started before the window is counted whole rather than
 * clipped to it: a night shift belongs to the day it was begun, and cutting
 * it would make the week's numbers depend on where the week is cut.
 */
async function trackedMinutes(userId, from, to){
    const row = await db()('task_time')
        .where({user_id: sid(userId)})
        .whereNotNull('ended_at')
        .where('started_at', '<', to.getTime())
        .where('ended_at', '>', from.getTime())
        .select(db().raw('COALESCE(SUM(ended_at - started_at), 0) AS ms'))
        .first()
    return Math.round(Number((row && row.ms) || 0) / 60000)
}

/**
 * The estimates on this person's tasks that are due inside the window.
 *
 * Two things make this awkward and both are consequences of the column model:
 * which key holds an estimate differs per board, and the value sits in a JSON
 * blob rather than a column. So the estimate columns are looked up first and
 * the tasks are added up here.
 *
 * Only tasks with a due date in the window count. An estimate with no date on
 * it is work somebody has to do at some point, which is a different question
 * from "does this week fit".
 */
async function estimateMinutes(userId, from, to){
    const columns = await db()('board_column').where({type: 'estimate'}).select('board_id', 'id', 'field')
    if(!columns.length) return 0

    const fieldsByBoard = new Map()
    for(const column of columns){
        const list = fieldsByBoard.get(column.board_id) || []
        list.push(column.field || column.id)
        fieldsByBoard.set(column.board_id, list)
    }

    const rows = await db()('task')
        .join('task_member', function(){
            this.on('task_member.board_id', '=', 'task.board_id')
                .andOn('task_member.task_id', '=', 'task.id')
        })
        .where('task_member.user_id', sid(userId))
        .whereIn('task.board_id', [...fieldsByBoard.keys()])
        .where('task.state', 'active')
        .select('task.board_id', 'task.col_values')

    let minutes = 0
    for(const row of rows){
        const values = parseJson(row.col_values, {}) || {}
        const due = Number(values.dueDate)
        if(!Number.isFinite(due) || due < from.getTime() || due >= to.getTime()) continue
        for(const field of fieldsByBoard.get(row.board_id) || []){
            const value = Number(values[field])
            if(Number.isFinite(value) && value > 0) minutes += value
        }
    }
    return minutes
}

module.exports = {
    findForUser, findForUsers, replaceForUser,
    plannedMinutes, trackedMinutes, estimateMinutes
}
