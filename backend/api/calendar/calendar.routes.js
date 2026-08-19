const express = require('express')
const {requireAuth, requireAdmin} = require('../../middlewares/requireAuth.middleware')
const c = require('./calendar.controller')

const router = express.Router()

// requireAuth for everything first — requireAdmin only asks whether the
// person is an admin, it does not work out who is asking.
router.use(requireAuth)

router.get('/events', c.events)
router.get('/status', c.status)
router.post('/sync', c.sync)

// Setting up whose Google account somebody is, is an administrative act:
// it points the server at a mailbox in the company domain.
router.get('/links', requireAdmin, c.links)
router.put('/links/:userId', requireAdmin, c.setLink)
router.delete('/links/:userId', requireAdmin, c.removeLink)
// Same handler as /sync; the admin variant names whose calendar.
router.post('/sync/:userId', c.sync)

module.exports = router
