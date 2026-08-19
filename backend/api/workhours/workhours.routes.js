const express = require('express')
const {requireAuth} = require('../../middlewares/requireAuth.middleware')
const c = require('./workhours.controller')

const router = express.Router()

router.use(requireAuth)

// Before '/:userId', or "mine" and "summary" would be read as user ids.
router.get('/mine', c.mine)
router.get('/summary', c.summary)
router.get('/all', c.all)

router.get('/:userId', c.forUser)
router.put('/:userId', c.save)

module.exports = router
