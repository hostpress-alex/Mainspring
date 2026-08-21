const express = require('express')
const {getBoards, getBoardById, addBoard, removeBoard} = require('./board.controller')
const {requireAuth} = require('../../middlewares/requireAuth.middleware')
const logger = require('../../services/logger.service')
const g = require('./board.controller.granular')
const router = express.Router()

// Every board route needs a logged-in user.
router.use(requireAuth)

// --- Gespeicherte Filter ---------------------------------------------------
router.get('/:boardId/view', g.getViews)
router.post('/:boardId/view', g.postView)
router.put('/:boardId/view/:viewId', g.putView)
router.delete('/:boardId/view/:viewId', g.deleteView)

// --- Papierkorb und Archiv -------------------------------------------------
// Before every /:boardId route below: `bin/boards` would otherwise be read as
// a board with the id "bin".
router.get('/bin/boards', g.getBoardsInState)
router.get('/:boardId/bin', g.getBin)
router.put('/:boardId/state', g.putBoardState)
router.put('/:boardId/group/:groupId/state', g.putGroupState)
router.put('/:boardId/task/:taskId/state', g.putTaskState)
router.delete('/:boardId/purge', g.purgeBoard)
router.delete('/:boardId/group/:groupId/purge', g.purgeGroup)
router.delete('/:boardId/task/:taskId/purge', g.purgeTask)

// --- Targeted writes ------------------------------------------------------
// Mind the order: the specific paths have to come BEFORE the general ones,
// otherwise /:boardId swallows everything.
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
router.post('/:boardId/group/:groupId/task/:taskId/comment', g.postComment)
router.post('/:boardId/group/:groupId/task/:taskId/subtask', g.postSubtask)
router.put('/:boardId/group/:groupId/task/:taskId/parent', g.putTaskParent)
router.put('/:boardId/member/:userId/role', g.putMemberRole)
router.put('/:boardId/group/:groupId/task/:taskId/subtasks/order', g.putSubtaskOrder)
router.post('/:boardId/task/:taskId/move', g.postTaskMove)
router.post('/:boardId/activity', g.postActivity)

// --- Reads and lifecycle --------------------------------------------------
router.get('/', getBoards)
router.get('/:boardId', getBoardById)
router.post('/', addBoard)
router.delete('/:boardId', removeBoard)

/* --- Retired whole-document writes ---------------------------------------
 *
 * Three PUT routes used to live here:
 *
 *     PUT /:boardId                        the entire board
 *     PUT /:boardId/:groupId               an entire group
 *     PUT /:boardId/:groupId/:taskId       an entire task
 *
 * They wrote back a whole document that the client had assembled, so two
 * people editing one board at the same time meant the later write silently
 * threw away everything the earlier one had done. Every one of them has a
 * targeted equivalent above.
 *
 * They answer 410 instead of disappearing. A 404 would look like a typo in
 * the path; this way anything still calling them says so plainly, in the
 * response and in the log.
 */
const RETIRED = {
    board: 'PUT /api/board/:boardId is retired. Use PATCH /api/board/:boardId for the header fields, or one of the targeted group/task routes.',
    group: 'PUT /api/board/:boardId/:groupId is retired. Use PATCH or PUT /api/board/:boardId/group/:groupId.',
    task: 'PUT /api/board/:boardId/:groupId/:taskId is retired. Use PATCH or PUT /api/board/:boardId/group/:groupId/task/:taskId.'
}

const retired = which => (req, res) => {
    logger.warn(`Retired route called: ${req.method} ${req.originalUrl}`)
    res.status(410).send({err: RETIRED[which]})
}

router.put('/:boardId/:groupId/:taskId', retired('task'))
router.put('/:boardId/:groupId', retired('group'))
router.put('/:boardId', retired('board'))

module.exports = router
