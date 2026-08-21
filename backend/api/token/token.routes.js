const express = require('express')
const {requireAuth, requireAdmin, requireSession} = require('../../middlewares/requireAuth.middleware')
const {listAllTokens, listTokens, createToken, revokeToken} = require('./token.controller')

const router = express.Router()

// Every route here: signed in, at a keyboard, and an admin. In that order,
// because "not signed in" and "signed in with a key" are different answers.
router.use(requireAuth, requireSession, requireAdmin)

// Everything, for the overview. Before the /user route: not because express
// would confuse them, but because "all" is the read this page actually does.
router.get('/', listAllTokens)
router.get('/user/:userId', listTokens)
router.post('/user/:userId', createToken)
router.delete('/:tokenId', revokeToken)

module.exports = router
