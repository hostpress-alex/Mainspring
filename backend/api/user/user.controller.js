const userService = require('./user.service')
const socketService = require('../../services/socket.service')
const logger = require('../../services/logger.service')
const asyncLocalStorage = require('../../services/als.service')

function getRequester(){
    const store = asyncLocalStorage.getStore()
    return (store && store.loggedinUser) || null
}

async function getUser(req, res){
    try {
        const user = await userService.getById(req.params.id)
        res.send(user)
    } catch(err) {
        logger.error('Failed to get user', err)
        res.status(500).send({err: 'Failed to get user'})
    }
}

async function getUsers(req, res){
    try {
        // The administration asks for the closed accounts too; everything else
        // wants people it can actually pick.
        const users = await userService.query({withInactive: req.query.withInactive === 'true'})
        res.send(users)
    } catch(err) {
        logger.error('Failed to get users', err)
        res.status(500).send({err: 'Failed to get users'})
    }
}

/**
 * Closes the account rather than deleting it — see user.service.remove. The
 * route keeps its name and its verb: every caller already means "this person
 * is gone", and what that has to do to the database is not the caller's
 * business.
 */
async function deleteUser(req, res){
    try {
        await userService.remove(req.params.id, getRequester())
        res.send({msg: 'Deactivated successfully'})
    } catch(err) {
        if(!err.status) logger.error('Failed to deactivate user', err)
        res.status(err.status || 500).send({err: err.status?err.message:'Failed to deactivate user'})
    }
}

/** The devices this account is signed in on. Self or admin. */
async function listSessions(req, res){
    try {
        const store = asyncLocalStorage.getStore()
        res.json(await userService.sessions(req.params.id, getRequester(), store && store.sessionId))
    } catch(err) {
        if(!err.status) logger.error('Failed to list the sessions', err)
        res.status(err.status || 500).send({err: err.status?err.message:'Failed to list the sessions'})
    }
}

/** End one of them. If it is the one asking, its cookie goes too. */
async function endSession(req, res){
    try {
        const store = asyncLocalStorage.getStore()
        const result = await userService.endSession(req.params.id, req.params.sessionId, getRequester())
        if(store && store.sessionId === req.params.sessionId) res.clearCookie('loginToken')
        res.json(result)
    } catch(err) {
        if(!err.status) logger.error('Failed to end the session', err)
        res.status(err.status || 500).send({err: err.status?err.message:'Failed to end the session'})
    }
}

/**
 * Sign this person out of every browser, including the one asking.
 *
 * The cookie goes with the answer: it is invalid from this moment on, and
 * leaving it in place only means the next request finds out the hard way.
 */
async function logoutEverywhere(req, res){
    try {
        const result = await userService.logoutEverywhere(req.params.id, getRequester())
        if(String(getRequester()?._id) === String(req.params.id)) res.clearCookie('loginToken')
        res.json(result)
    } catch(err) {
        if(!err.status) logger.error('Failed to sign the user out everywhere', err)
        res.status(err.status || 500).send({err: err.status?err.message:'Failed to sign out'})
    }
}

/** Switch an account back on, or off, by name. Admins only. */
async function setUserState(req, res){
    try {
        res.json(await userService.setState(req.params.id, req.body.state, getRequester()))
    } catch(err) {
        if(!err.status) logger.error('Failed to change the user state', err)
        res.status(err.status || 500).send({err: err.status?err.message:'Failed to change the user state'})
    }
}

async function updateUser(req, res){
    try {
        const user = {...req.body, _id: req.params.id}
        const savedUser = await userService.update(user, getRequester())
        res.send(savedUser)
    } catch(err) {
        if(!err.status) logger.error('Failed to update user', err)
        res.status(err.status || 500).send({err: err.status?err.message:'Failed to update user'})
    }
}

async function addUser(req, res){
    try {
        const created = await userService.create(req.body)
        res.json(created)
    } catch(err) {
        if(!err.status) logger.error('Failed to create user', err)
        res.status(err.status || 500).send({err: err.status?err.message:'Failed to create user'})
    }
}

module.exports = {
    getUser,
    getUsers,
    deleteUser,
    setUserState,
    logoutEverywhere,
    listSessions,
    endSession,
    updateUser,
    addUser
}