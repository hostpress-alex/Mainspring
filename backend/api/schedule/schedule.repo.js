/**
 * Storage access for calendar entries.
 *
 * start/end are called start_at/end_at in the database: END is a reserved
 * word in SQL.
 */
const crypto = require('crypto')
const {db} = require('../../db/knex')

const sid = v => (v === undefined || v === null)?'':String(v)
const newId = () => crypto.randomBytes(12).toString('hex')

function out(row){
    if(!row) return null
    return {
        _id: row.id,
        userId: row.user_id,
        boardId: row.board_id,
        boardTitle: row.board_title || '',
        groupId: row.group_id || '',
        groupTitle: row.group_title || '',
        taskId: row.task_id || '',
        taskTitle: row.task_title === null?'':row.task_title,
        color: row.color || '',
        start: row.start_at,
        end: row.end_at,
        note: row.note || '',
        // Who put it there. The calendar draws the planner's own blocks
        // differently and lets a person take one over by moving it.
        source: row.source || 'manual',
        isAssumed: Boolean(row.is_assumed),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}

function toRow(entry){
    return {
        user_id: sid(entry.userId),
        board_id: sid(entry.boardId),
        board_title: entry.boardTitle || '',
        group_id: sid(entry.groupId),
        group_title: entry.groupTitle || '',
        task_id: sid(entry.taskId),
        task_title: entry.taskTitle || '',
        color: entry.color || '',
        start_at: new Date(entry.start),
        end_at: new Date(entry.end),
        note: entry.note || '',
        // Anything written through the ordinary calendar routes belongs to a
        // person, and the planner leaves it alone from then on. Its own
        // blocks are written past this function — see planner.repo.
        source: 'manual',
        is_assumed: false,
        created_at: entry.createdAt?new Date(entry.createdAt):new Date(),
        updated_at: entry.updatedAt?new Date(entry.updatedAt):new Date()
    }
}

async function findForUser(userId, {from, to} = {}){
    let q = db()('schedule').where({user_id: sid(userId)})
    // Ueberlappung statt Enthaltensein: ein Eintrag, der in die Woche
    // hineinragt, muss mitkommen.
    if(to) q = q.where('start_at', '<', new Date(to))
    if(from) q = q.where('end_at', '>', new Date(from))
    return (await q.orderBy('start_at')).map(out)
}

async function findById(id){
    return out(await db()('schedule').where({id: sid(id)}).first())
}

async function insert(entry){
    // Bei der Migration kommt die alte Id mit, damit nichts umgeschluesselt
    // werden muss. Im Normalbetrieb vergibt der Server eine neue.
    const given = sid(entry._id)
    const id = /^[a-f0-9]{24}$/i.test(given)?given.toLowerCase():newId()
    await db()('schedule').insert({id, ...toRow(entry)})
    return await findById(id)
}

async function replace(id, entry){
    const count = await db()('schedule').where({id: sid(id)}).update(toRow(entry))
    if(!count) return null
    return await findById(id)
}

async function deleteById(id){
    await db()('schedule').where({id: sid(id)}).del()
}

module.exports = {findForUser, findById, insert, replace, deleteById}
