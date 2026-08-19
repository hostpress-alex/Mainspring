/**
 * The rules of the global priority list.
 *
 * The list is small, closed, and the same everywhere — that is the whole
 * point of it. So this file is mostly about the two ways such a list gets
 * ruined: two entries that mean the same thing, and an entry that disappears
 * while tasks still point at it.
 *
 * Reading is allowed to everybody who is logged in: a board cannot be drawn
 * without it. Writing is admin-only, enforced on the route.
 */
const priorityRepo = require('./priority.repo')

/** Long enough for a sentence nobody wants in a cell, short enough to fit. */
const MAX_TITLE = 40
const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/

function fail(status, message, code){
    const err = new Error(message)
    err.status = status
    if(code) err.code = code
    return err
}

function cleanTitle(value){
    const title = String(value === undefined || value === null?'':value).replace(/\s+/g, ' ').trim()
    if(!title) throw fail(400, 'A priority needs a name')
    if(title.length > MAX_TITLE) throw fail(400, `A priority name is at most ${MAX_TITLE} characters`)
    return title
}

function cleanColor(value, fallback = '#c4c4c4'){
    if(value === undefined || value === null || value === '') return fallback
    const color = String(value).trim()
    if(!HEX.test(color)) throw fail(400, 'A colour looks like #rrggbb')
    return color.toLowerCase()
}

async function list(){
    return await priorityRepo.findAll()
}

/** The list plus how often each one is used. Admin screen only. */
async function listWithUsage(){
    const [priorities, usage] = await Promise.all([priorityRepo.findAll(), priorityRepo.usage()])
    return priorities.map(p => ({...p, usage: usage[p.id] || 0}))
}

async function create({title, color}){
    const clean = cleanTitle(title)
    if(await priorityRepo.findByTitle(clean)) throw fail(409, 'There is already a priority with that name')
    return await priorityRepo.insert({title: clean, color: cleanColor(color)})
}

async function update(id, {title, color}){
    const current = await priorityRepo.findById(id)
    if(!current) throw fail(404, 'Priority not found')

    const patch = {}
    if(title !== undefined){
        patch.title = cleanTitle(title)
        if(await priorityRepo.findByTitle(patch.title, id)){
            throw fail(409, 'There is already a priority with that name')
        }
    }
    if(color !== undefined) patch.color = cleanColor(color, current.color)
    return await priorityRepo.update(id, patch)
}

async function reorder(ids){
    if(!Array.isArray(ids) || !ids.length) throw fail(400, 'Give the ids in the order they should be in')
    const known = new Set((await priorityRepo.findAll()).map(p => p.id))
    for(const id of ids){
        if(!known.has(id)) throw fail(400, 'Unknown priority in the order')
    }
    await priorityRepo.reorder(ids)
    return await priorityRepo.findAll()
}

/**
 * Delete, and say where the tasks should go.
 *
 * `reassignTo` is not optional the moment anything uses the priority. The
 * alternative — clearing those cells — loses an answer somebody gave, and
 * loses it silently in a place nobody is looking at the time.
 */
async function remove(id, reassignTo){
    const current = await priorityRepo.findById(id)
    if(!current) throw fail(404, 'Priority not found')

    const usage = (await priorityRepo.usage())[id] || 0
    if(usage > 0){
        if(!reassignTo || reassignTo === id){
            const err = fail(409, 'This priority is in use — say which one the tasks should get', 'REASSIGN_REQUIRED')
            err.usage = usage
            throw err
        }
        if(!await priorityRepo.findById(reassignTo)) throw fail(400, 'The priority to move them onto does not exist')
    }

    const all = await priorityRepo.findAll()
    if(all.length <= 1) throw fail(409, 'The last priority cannot be deleted')

    const moved = await priorityRepo.removeWithReassign(id, reassignTo || null)
    return {removed: current, moved}
}

/**
 * Is this a value a priority cell may hold?
 *
 * Empty is always allowed — that is how a priority is taken off a task.
 */
async function isAllowedValue(value){
    if(value === null || value === undefined || value === '') return true
    if(typeof value !== 'string') return false
    return Boolean(await priorityRepo.findById(value))
}

module.exports = {list, listWithUsage, create, update, reorder, remove, isAllowedValue, MAX_TITLE}
