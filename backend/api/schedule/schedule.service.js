/**
 * Personal scheduling: which user works on which task and when.
 *
 * Deliberately its own collection instead of a field on the board:
 *  - the schedule belongs to one user, the board belongs to everyone
 *  - saveBoard writes the complete board document; putting schedule entries
 *    in there would rewrite everything on every task click
 *  - date range queries need an index on start/end
 */
const logger = require('../../services/logger.service')
const asyncLocalStorage = require('../../services/als.service')
const boardService = require('../board/board.service')
const scheduleRepo = require('./schedule.repo')

const MAX_DURATION_MS = 24 * 60 * 60 * 1000
const MIN_DURATION_MS = 5 * 60 * 1000

function httpError(status, msg){
    const err = new Error(msg)
    err.status = status
    return err
}

function getLoggedinUser(){
    const store = asyncLocalStorage.getStore()
    return (store && store.loggedinUser) || null
}

function requireUser(){
    const user = getLoggedinUser()
    if(!user) throw httpError(401, 'Not Authenticated')
    return user
}

function parseDate(value, label){
    const d = new Date(value)
    if(!value || Number.isNaN(d.getTime())) throw httpError(400, `${label} ist kein gueltiges Datum`)
    return d
}

/** Only the fields the client is allowed to set. */
async function buildEntry(payload, user){
    const start = parseDate(payload.start, 'start')
    const end = parseDate(payload.end, 'end')

    if(end <= start) throw httpError(400, 'Das Ende muss nach dem Beginn liegen')
    if(end - start < MIN_DURATION_MS) throw httpError(400, 'Ein Eintrag muss mindestens 5 Minuten lang sein')
    if(end - start > MAX_DURATION_MS) throw httpError(400, 'Ein Eintrag darf hoechstens 24 Stunden dauern')

    if(!payload.boardId || !payload.taskId) throw httpError(400, 'boardId und taskId sind Pflicht')

    // Only what the user may see can be scheduled. Title and color drop out
    // of that at the same time, so the calendar can show it without refetching.
    let board
    try {
        board = await boardService.getById(payload.boardId)
    } catch(err) {
        if(err.status === 403 || err.status === 404) throw httpError(403, 'Kein Zugriff auf dieses Board')
        throw err
    }

    let group = null
    let task = null
    for(const g of board.groups || []){
        const found = (g.tasks || []).find(t => t.id === payload.taskId)
        if(found){
            group = g;
            task = found;
            break
        }
    }
    if(!task) throw httpError(404, 'Task nicht in diesem Board gefunden')

    return {
        userId: String(user._id),
        boardId: String(board._id),
        boardTitle: board.title,
        groupId: group.id,
        groupTitle: group.title,
        taskId: task.id,
        taskTitle: task.title,
        color: group.color || '#0073ea',
        start,
        end,
        note: typeof payload.note === 'string'?payload.note.slice(0, 500):''
    }
}

/** Entries of the logged-in user that touch the given period. */
async function query({from, to} = {}){
    const user = requireUser()
    try {
        return await scheduleRepo.findForUser(user._id, {
            from: from?parseDate(from, 'from'):null,
            to: to?parseDate(to, 'to'):null
        })
    } catch(err) {
        if(!err.status) logger.error('cannot query schedule', err)
        throw err
    }
}

async function add(payload){
    const user = requireUser()
    try {
        const entry = await buildEntry(payload, user)
        entry.createdAt = new Date()
        entry.updatedAt = entry.createdAt
        return await scheduleRepo.insert(entry)
    } catch(err) {
        if(!err.status) logger.error('cannot add schedule entry', err)
        throw err
    }
}

async function update(id, payload){
    const user = requireUser()
    try {
        const existing = await scheduleRepo.findById(id)
        if(!existing) throw httpError(404, 'Eintrag nicht gefunden')
        if(String(existing.userId) !== String(user._id)){
            throw httpError(403, 'Das ist nicht dein Kalendereintrag')
        }

        const entry = await buildEntry({...existing, ...payload}, user)
        entry.createdAt = existing.createdAt
        entry.updatedAt = new Date()
        const saved = await scheduleRepo.replace(existing._id, entry)
        if(!saved) throw httpError(404, 'Eintrag nicht gefunden')
        return saved
    } catch(err) {
        if(!err.status) logger.error(`cannot update schedule entry ${id}`, err)
        throw err
    }
}

async function remove(id){
    const user = requireUser()
    try {
        const existing = await scheduleRepo.findById(id)
        if(!existing) throw httpError(404, 'Eintrag nicht gefunden')
        if(String(existing.userId) !== String(user._id)){
            throw httpError(403, 'Das ist nicht dein Kalendereintrag')
        }
        await scheduleRepo.deleteById(existing._id)
        return String(existing._id)
    } catch(err) {
        if(!err.status) logger.error(`cannot remove schedule entry ${id}`, err)
        throw err
    }
}

module.exports = {query, add, update, remove, MIN_DURATION_MS, MAX_DURATION_MS}
