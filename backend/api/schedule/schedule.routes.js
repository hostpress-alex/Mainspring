const express = require('express')
const { requireAuth } = require('../../middlewares/requireAuth.middleware')
const { getEntries, addEntry, updateEntry, removeEntry } = require('./schedule.controller')

const router = express.Router()

// Der Kalender ist persoenlich — jede Route arbeitet nur auf den eigenen
// Eintraegen, die Pruefung sitzt im Service.
router.use(requireAuth)

router.get('/', getEntries)
router.post('/', addEntry)
router.put('/:id', updateEntry)
router.delete('/:id', removeEntry)

module.exports = router
