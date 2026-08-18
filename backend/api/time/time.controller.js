/**
 * The time-tracking endpoints.
 *
 * Whose time is being recorded never comes from the request — it is the
 * session's user, always. There is no route that takes a user id, so there is
 * no way to book an afternoon onto somebody else.
 */
const timeService = require('./time.service')
const asyncLocalStorage = require('../../services/als.service')
const logger = require('../../services/logger.service')

function requester(){
    const store = asyncLocalStorage.getStore()
    return (store && store.loggedinUser) || null
}

/**
 * `code` and `running` travel with the answer.
 *
 * The 409 from a second start is not an error the user should read as prose —
 * it is a question the interface has to ask ("pause the other one or stop
 * it?"), and it needs the other entry to ask it with.
 */
const handler = (fn, fallback) => async (req, res) => {
    try {
        const user = requester()
        if(!user) return res.status(401).send({err: 'Not Authenticated'})
        res.json(await fn(req, user))
    } catch(err){
        if(!err.status) logger.error(fallback, err)
        const body = {err: err.status?err.message:fallback}
        if(err.code) body.code = err.code
        if(err.running) body.running = err.running
        res.status(err.status || 500).send(body)
    }
}

module.exports = {
    /** What the caller has open right now, or null. */
    running: handler(async (req, user) =>
        ({running: await timeService.running(user)}), 'Could not read the running timer'),

    /** Every interval on one task, with the totals. */
    forTask: handler(async (req, user) =>
        await timeService.forTask(user, req.params.boardId, req.params.taskId), 'Could not read the time entries'),

    /** One number per task, for the board. */
    totals: handler(async (req, user) =>
        ({totals: await timeService.totalsForBoard(user, req.params.boardId)}), 'Could not read the totals'),

    start: handler(async (req, user) => {
        const {boardId, taskId, resolve} = req.body || {}
        return {entry: await timeService.start(user, {boardId, taskId, resolve})}
    }, 'Could not start the timer'),

    close: handler(async (req, user) => {
        const {mode, note, postUpdate, endedAt} = req.body || {}
        return await timeService.close(user, {mode, note, postUpdate, endedAt})
    }, 'Could not stop the timer'),

    addManual: handler(async (req, user) =>
        ({entry: await timeService.addManual(user, req.body || {})}), 'Could not add the entry'),

    edit: handler(async (req, user) =>
        ({entry: await timeService.edit(user, req.params.entryId, req.body || {})}), 'Could not change the entry'),

    remove: handler(async (req, user) =>
        await timeService.remove(user, req.params.entryId), 'Could not delete the entry')
}
