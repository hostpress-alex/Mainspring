const express = require('express')
const {requireAuth} = require('../../middlewares/requireAuth.middleware')
const c = require('./seen.controller')

const router = express.Router()

router.use(requireAuth)

router.get('/task/:boardId/:taskId', c.forTask)
router.post('/:boardId/:taskId', c.mark)

module.exports = router
