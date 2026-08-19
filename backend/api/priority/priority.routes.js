const express = require('express')
const {requireAuth, requireAdmin} = require('../../middlewares/requireAuth.middleware')
const c = require('./priority.controller')

const router = express.Router()

/**
 * requireAuth first, for every route.
 *
 * requireAdmin does not authenticate — it only asks whether the person the
 * session resolved to is an admin. On its own it therefore answers 401 to an
 * admin with a perfectly good cookie, which the frontend reads as "signed
 * out" and acts on.
 */
router.use(requireAuth)

// Reading is not a privilege: no board can be drawn without this list.
router.get('/', c.list)

// The counts are only interesting where something can be done with them, and
// they cost a pass over every task — so they are not in the plain list.
router.get('/usage', requireAdmin, c.listWithUsage)

router.post('/', requireAdmin, c.add)
router.put('/order', requireAdmin, c.sort)
router.put('/:id', requireAdmin, c.edit)
router.delete('/:id', requireAdmin, c.remove)

module.exports = router
