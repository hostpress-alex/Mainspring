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
        const users = await userService.query()
        res.send(users)
    } catch(err) {
        logger.error('Failed to get users', err)
        res.status(500).send({err: 'Failed to get users'})
    }
}

async function deleteUser(req, res){
    try {
        const requester = getRequester()
        if(requester && String(requester._id) === String(req.params.id)){
            return res.status(400).send({err: 'Du kannst dich nicht selbst loeschen'})
        }
        await userService.remove(req.params.id)
        res.send({msg: 'Deleted successfully'})
    } catch(err) {
        logger.error('Failed to delete user', err)
        res.status(500).send({err: 'Failed to delete user'})
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
    updateUser,
    addUser
}