const express = require('express')
const {requireAuth} = require('../../middlewares/requireAuth.middleware')
const c = require('./automation.controller')

const router = express.Router()

// Automations are board structure. Everything here is owner-only, checked in
// the service against the board the rule belongs to.
router.use(requireAuth)

router.get('/board/:boardId', c.list)
router.get('/board/:boardId/runs', c.runs)
router.post('/board/:boardId', c.create)
router.put('/:id', c.update)
router.delete('/:id', c.remove)

module.exports = router
