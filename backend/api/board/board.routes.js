const express = require('express')
const { getBoards, getBoardById, addBoard, updateBoard, removeBoard, updateTask, updateGroup } = require('./board.controller')
const { requireAuth } = require('../../middlewares/requireAuth.middleware')
const g = require('./board.controller.granular')
const router = express.Router()

// Alle Board-Routen erfordern einen eingeloggten Benutzer.
router.use(requireAuth)

// --- Gezielte Schreibvorgaenge -------------------------------------------
// Reihenfolge beachten: die spezifischen Pfade muessen VOR den allgemeinen
// stehen, sonst schluckt PUT /:boardId alles.
router.patch('/:boardId', g.patchBoard)
router.put('/:boardId/columns', g.putColumns)
router.put('/:boardId/members', g.putMembers)
router.put('/:boardId/owners', g.putOwners)
router.put('/:boardId/groups/order', g.putGroupOrder)
router.post('/:boardId/group', g.postGroup)
router.patch('/:boardId/group/:groupId', g.patchGroup)
router.put('/:boardId/group/:groupId', g.putGroup)
router.delete('/:boardId/group/:groupId', g.deleteGroup)
router.put('/:boardId/group/:groupId/tasks/order', g.putTaskOrder)
router.post('/:boardId/group/:groupId/task', g.postTask)
router.patch('/:boardId/group/:groupId/task/:taskId', g.patchTask)
router.put('/:boardId/group/:groupId/task/:taskId', g.putTask)
router.delete('/:boardId/group/:groupId/task/:taskId', g.deleteTask)
router.post('/:boardId/task/:taskId/move', g.postTaskMove)
router.post('/:boardId/activity', g.postActivity)

// --- Altbestand ----------------------------------------------------------
// Die drei PUT-Routen weiter unten schreiben ganze Dokumente und koennen
// damit die Aenderungen anderer ueberschreiben. Das Frontend benutzt sie
// nicht mehr — bitte auch nicht wieder darauf zurueckgreifen.
router.get('/', getBoards)
router.get('/:boardId', getBoardById)
router.post('/', addBoard)
router.put('/:boardId/:groupId/:taskId', updateTask)
router.put('/:boardId/:groupId', updateGroup)
router.put('/:boardId', updateBoard)
router.delete('/:boardId', removeBoard)

// router.post('/:id/msg', requireAuth, addBoardMsg)
// router.delete('/:id/msg/:msgId', requireAuth, removeBoardMsg)

module.exports = router