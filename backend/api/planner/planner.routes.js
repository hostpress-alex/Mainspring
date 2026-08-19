const express = require('express')
const {requireAuth} = require('../../middlewares/requireAuth.middleware')
const c = require('./planner.controller')

const router = express.Router()

router.use(requireAuth)

// GET would be the honest verb for the preview — it changes nothing — but it
// is a lot of work per call, and a browser is free to prefetch a GET.
router.post('/preview', c.preview)
router.post('/preview/:userId', c.preview)
router.post('/run', c.run)
router.post('/run/:userId', c.run)

module.exports = router
