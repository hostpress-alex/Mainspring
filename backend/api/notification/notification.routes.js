const express = require('express')
const {requireAuth} = require('../../middlewares/requireAuth.middleware')
const c = require('./notification.controller')

const router = express.Router()

// Everything here is personal. There is no route that takes a user id.
router.use(requireAuth)

router.get('/', c.list)
router.get('/unread', c.unread)
router.post('/read', c.markRead)
router.post('/read-all', c.markAllRead)

router.get('/subscription/:boardId/:taskId', c.isMuted)
router.put('/subscription/:boardId/:taskId', c.setMuted)

module.exports = router
