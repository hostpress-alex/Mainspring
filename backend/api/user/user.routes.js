const express = require('express')
const {requireAuth, requireAdmin, requireSession} = require('../../middlewares/requireAuth.middleware')
const {getUser, getUsers, deleteUser, setUserState, logoutEverywhere,
    listSessions, endSession, updateUser, addUser} = require('./user.controller')
const router = express.Router()

// The user list is not public either.
router.use(requireAuth)

// Reading who is on the team is something an integration may legitimately do
// — it is how a script turns a name into an id. Everything that CHANGES a
// person is a person's job: see requireSession.
router.get('/', getUsers)
router.get('/:id', getUser)
router.post('/', requireSession, requireAdmin, addUser)
router.put('/:id', requireSession, updateUser)   // Self or admin — checked in the service
// Self or admin, all three — checked in the service.
router.get('/:id/sessions', requireSession, listSessions)
router.delete('/:id/sessions/:sessionId', requireSession, endSession)
router.put('/:id/sessions', requireSession, logoutEverywhere)
router.put('/:id/state', requireSession, requireAdmin, setUserState)
router.delete('/:id', requireSession, requireAdmin, deleteUser)

module.exports = router