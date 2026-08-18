const express = require('express')
const {requireAuth} = require('../../middlewares/requireAuth.middleware')
const c = require('./reaction.controller')

const router = express.Router()

router.use(requireAuth)

router.get('/task/:boardId/:taskId', c.forTask)
router.put('/:boardId/:taskId/:commentId', c.toggle)

module.exports = router
