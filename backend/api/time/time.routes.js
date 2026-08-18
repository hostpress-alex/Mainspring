const express = require('express')
const {requireAuth} = require('../../middlewares/requireAuth.middleware')
const c = require('./time.controller')

const router = express.Router()

// Time is always somebody's, so there is nothing here to read signed out.
router.use(requireAuth)

// Mind the order: `running` and `task` are literal path segments and have to
// come before anything that could read them as an id.
router.get('/running', c.running)
router.get('/task/:boardId/:taskId', c.forTask)
router.get('/board/:boardId/totals', c.totals)

router.post('/start', c.start)
router.post('/close', c.close)

router.post('/entry', c.addManual)
router.patch('/entry/:entryId', c.edit)
router.delete('/entry/:entryId', c.remove)

module.exports = router
