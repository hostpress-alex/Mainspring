/**
 * Reads and lifecycle for boards.
 *
 * Every write that changes a part of a board lives in
 * board.controller.granular.js. This file used to carry updateBoard,
 * updateTask and updateGroup as well; they wrote back whole documents and
 * were retired together with their routes. See board.routes.js.
 */
const boardService = require('./board.service.js')

const logger = require('../../services/logger.service')

async function getBoards(req, res){
    try {
        logger.debug('Getting boards')
        const filterBy = {
            title: req.query.title || ''
        }
        filterBy.isStarred = req.query.isStarred === 'true'?true:false

        const boards = await boardService.query(filterBy)
        res.json(boards)
    } catch(err) {
        logger.error('Failed to get boards', err)
        res.status(err.status || 500).send({err: err.status?err.message:'Failed to get boards'})
    }
}

async function getBoardById(req, res){
    try {
        const boardId = req.params.boardId
        const board = await boardService.getById(boardId)
        res.json(board)
    } catch(err) {
        logger.error('Failed to get board', err)
        res.status(err.status || 500).send({err: err.status?err.message:'Failed to get board'})
    }
}

async function addBoard(req, res){
    try {
        const board = req.body
        const addedBoard = await boardService.add(board)
        res.json(addedBoard)
    } catch(err) {
        logger.error('Failed to add board', err)
        res.status(err.status || 500).send({err: err.status?err.message:'Failed to add board'})
    }
}

async function removeBoard(req, res){
    try {
        const boardId = req.params.boardId
        const removedId = await boardService.remove(boardId)
        res.send(removedId)
    } catch(err) {
        logger.error('Failed to remove board', err)
        res.status(err.status || 500).send({err: err.status?err.message:'Failed to remove board'})
    }
}

module.exports = {
    getBoards,
    getBoardById,
    addBoard,
    removeBoard
}
