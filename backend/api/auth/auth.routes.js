const express = require('express')
const {login, signup, logout, me} = require('./auth.controller')
const {requireAuth} = require('../../middlewares/requireAuth.middleware')

const router = express.Router()

router.post('/login', login)
router.post('/signup', signup)
router.post('/logout', logout)

// The only route here that needs a session — it is the one that reports on it.
router.get('/me', requireAuth, me)

module.exports = router