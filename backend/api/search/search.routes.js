const express = require('express')
const {requireAuth} = require('../../middlewares/requireAuth.middleware')
const c = require('./search.controller')

const router = express.Router()

// There is no route that takes a user id: the search always runs as whoever
// is logged in, and what they may see is decided in the queries themselves.
router.use(requireAuth)

router.get('/', c.search)

module.exports = router
