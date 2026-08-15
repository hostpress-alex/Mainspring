const express = require('express')
const {requireAuth} = require('../../middlewares/requireAuth.middleware')
const {getEntries, addEntry, updateEntry, removeEntry} = require('./schedule.controller')

const router = express.Router()

// The calendar is personal — every route works only on the user's own
// entries, the check sits in the service.
router.use(requireAuth)

router.get('/', getEntries)
router.post('/', addEntry)
router.put('/:id', updateEntry)
router.delete('/:id', removeEntry)

module.exports = router
