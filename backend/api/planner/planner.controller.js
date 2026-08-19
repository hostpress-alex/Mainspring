/**
 * The planner over HTTP.
 *
 * Everybody plans their own calendar. An admin may plan for somebody else,
 * because somebody has to be able to answer "why is my week empty" — but
 * there is deliberately no route that plans for everybody at once from the
 * outside. That belongs to the triggers, which know what changed.
 */
const plannerService = require('./planner.service')
const asyncLocalStorage = require('../../services/als.service')
const logger = require('../../services/logger.service')

function requester(){
    const store = asyncLocalStorage.getStore()
    return (store && store.loggedinUser) || null
}

const handler = (fn, fallback) => async (req, res) => {
    try {
        const user = requester()
        if(!user) return res.status(401).send({err: 'Not Authenticated'})
        res.json(await fn(req, user))
    } catch(err){
        if(!err.status) logger.error(fallback, err)
        res.status(err.status || 500).send({err: err.status?err.message:fallback})
    }
}

function target(req, user){
    const wanted = req.params.userId || String(user._id)
    if(String(wanted) !== String(user._id) && !user.isAdmin){
        const err = new Error('Not Authorized')
        err.status = 403
        throw err
    }
    return wanted
}

module.exports = {
    /** What it would do. Writes nothing. */
    preview: handler(async (req, user) => await plannerService.preview(target(req, user)),
        'Could not work out a plan'),

    /** What it would do, and then does. */
    run: handler(async (req, user) => await plannerService.run(target(req, user)),
        'Could not save the plan')
}
