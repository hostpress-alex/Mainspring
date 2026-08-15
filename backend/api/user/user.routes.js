const express = require('express')
const {requireAuth, requireAdmin} = require('../../middlewares/requireAuth.middleware')
const {getUser, getUsers, deleteUser, updateUser, addUser} = require('./user.controller')
const router = express.Router()

// Auch die Benutzerliste ist nicht oeffentlich.
router.use(requireAuth)

router.get('/', getUsers)
router.get('/:id', getUser)
router.post('/', requireAdmin, addUser)
router.put('/:id', updateUser)          // Selbst oder Admin — geprueft im Service
router.delete('/:id', requireAdmin, deleteUser)

module.exports = router