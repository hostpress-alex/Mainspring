/**
 * The global priority list over HTTP.
 *
 * Everybody logged in may read it; only an admin may change it. That split is
 * on the routes, not in here.
 *
 * Every change is announced to everybody, not just to the admin who made it.
 * A renamed priority has to reach fifteen open boards, and they are not
 * looking at the admin screen — see socket.service.emitToAll.
 */
const priorityService = require('./priority.service')
const logger = require('../../services/logger.service')

/** Late, like everywhere else that touches sockets: it drags the board layer. */
const sockets = () => require('../../services/socket.service')

const PRIORITIES_CHANGED = 'priorities-changed'

function announce(){
    try {
        sockets().emitToAll({type: PRIORITIES_CHANGED})
    } catch(err) {
        // Telling people is commentary. It must not fail the write.
        logger.error('could not announce the priority change', err)
    }
}

const handler = (fn, fallback) => async (req, res) => {
    try {
        res.json(await fn(req))
    } catch(err){
        if(!err.status) logger.error(fallback, err)
        const body = err.status?{err: err.message}:{err: fallback}
        if(err.code) body.code = err.code
        if(err.usage !== undefined) body.usage = err.usage
        res.status(err.status || 500).send(body)
    }
}

module.exports = {
    list: handler(async () => ({priorities: await priorityService.list()}),
        'Could not read the priorities'),

    listWithUsage: handler(async () => ({priorities: await priorityService.listWithUsage()}),
        'Could not read the priorities'),

    add: handler(async req => {
        const priority = await priorityService.create(req.body || {})
        announce()
        return priority
    }, 'Could not save the priority'),

    edit: handler(async req => {
        const priority = await priorityService.update(req.params.id, req.body || {})
        announce()
        return priority
    }, 'Could not save the priority'),

    sort: handler(async req => {
        const priorities = await priorityService.reorder((req.body || {}).ids)
        announce()
        return {priorities}
    }, 'Could not save the order'),

    remove: handler(async req => {
        const result = await priorityService.remove(req.params.id, (req.body || {}).reassignTo)
        announce()
        return result
    }, 'Could not delete the priority')
}
