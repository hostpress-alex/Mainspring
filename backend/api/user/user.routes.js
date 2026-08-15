const express = require('express')
const {requireAuth, requireAdmin} = require('../../middlewares/requireAuth.middleware')
const {getUser, getUsers, deleteUser, updateUser, addUser} = require('./user.controller')
const router = express.Router()

// The user list is not public either.
router.use(requireAuth)

router.get('/', getUsers)
router.get('/:id', getUser)
router.post('/', requireAdmin, addUser)
router.put('/:id', updateUser)          // Self or admin — checked in the service
router.delete('/:id', requireAdmin, deleteUser)

module.exports = router