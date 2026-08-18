/**
 * Real-time layer.
 *
 * Two things happen here, and until now neither of them was checked.
 *
 *   1. Identity. A socket used to announce who it was — it emitted
 *      'set-user-socket' with a user id and the server believed it. Identity
 *      now comes from the same httpOnly `loginToken` cookie the REST API
 *      uses, read once during the handshake. A client can no longer claim to
 *      be somebody else.
 *
 *   2. Rooms. A socket used to join any room it named, so anyone — logged in
 *      or not — could listen to any board by guessing its id and receive the
 *      full board contents. Joining a board room now needs the same access
 *      the REST API demands.
 *
 * The wire protocol is unchanged. Clients still emit 'chat-set-topic' with a
 * board id or a task id; only the server's answer to "are you allowed?" is
 * new. One socket is in at most one room at a time, exactly as before.
 *
 * Boards are no longer relayed between clients. 'board-send-update' used to
 * take a board the CLIENT had composed and hand it to everybody else in the
 * room, unverified — so a member could push a board that never existed, and,
 * far more often, whoever happened to save decided what the others saw. Every
 * write in board.service.js now reads the board back and emits it from here
 * (see _pushed there). The event a client listens for is unchanged.
 */
const config = require('../config')
const logger = require('./logger.service')
const authService = require('../api/auth/auth.service')
const boardService = require('../api/board/board.service')
const boardRepo = require('../api/board/board.repo')

const COOKIE_NAME = 'loginToken'

/** Room prefixes. Task rooms carry the board id as well, so two boards that
 *  happen to use the same task id can never share a room. */
const BOARD_ROOM = 'board:'
const TASK_ROOM = 'task:'

/** Every socket one person has open. A message addressed at a person goes to
 *  this room, so it reaches all of their tabs and never a socket that has
 *  already gone away. */
const USER_ROOM = 'user:'

let gIo = null

/* ------------------------------------------------------------- handshake -- */

/** Read one cookie out of a raw Cookie header. Needs no dependency. */
function readCookie(header, name){
    if(!header) return null
    for(const part of String(header).split(';')){
        const eq = part.indexOf('=')
        if(eq < 0) continue
        if(part.slice(0, eq).trim() !== name) continue
        const raw = part.slice(eq + 1).trim()
        try {
            return decodeURIComponent(raw)
        } catch(err) {
            return raw
        }
    }
    return null
}

/**
 * Who is on the other end of this socket?
 *
 * Returns null for anonymous sockets. Anonymous sockets are still allowed to
 * connect — the client opens its socket while the login page is on screen,
 * and refusing the connection there would put socket.io into a retry loop —
 * but they cannot join a room or send a message.
 *
 * Asynchronous now: the cookie is an opaque token and the session it names is
 * a row. It used to be a decrypt, which is why this was a plain function.
 */
async function identify(handshake){
    const header = handshake && handshake.headers && handshake.headers.cookie
    const token = readCookie(header, COOKIE_NAME)
    if(!token) return null
    const session = await authService.resolveSession(token)
    if(!session) return null
    // Only the id is kept. Everything the socket decides is decided against
    // the account read at that moment — see boardIfPermitted.
    return {_id: session.userId}
}

/* ------------------------------------------------------------ permission -- */

/** The board, if this user may see it. Null in every other case. */
async function boardIfPermitted(boardId, user){
    if(!boardId || !user) return null
    // The socket's user comes from the cookie it connected with, and a cookie
    // outlives the account it names. Same question the REST layer asks, same
    // ten-second answer.
    const account = await require('./account.service').currentUser(user._id)
    if(!account) return null
    let board
    try {
        board = await boardRepo.findById(boardId)
    } catch(err) {
        // A malformed id makes the repo throw a 404 — same answer as "no".
        return null
    }
    if(!board) return null
    return boardService.hasAccess(board, account)?board:null
}

function boardHasTask(board, taskId){
    const id = String(taskId)
    for(const group of (board && board.groups) || []){
        for(const task of group.tasks || []){
            if(String(task.id) === id) return true
        }
    }
    return false
}

/**
 * Turn the topic a client asked for into the room it is actually allowed to
 * join. Returns null when it may not join anything.
 *
 * A topic is either a board id (board-details.jsx) or a task id
 * (task-modal.jsx). A task modal is only ever opened from inside a board the
 * client already had open, so a task topic is resolved against the board this
 * socket was last authorised for. That keeps the lookup exact — (board_id, id)
 * is the primary key of a task — and avoids scanning for a task id that is
 * only unique within its own board.
 */
async function resolveRoom(socket, topic){
    const id = String(topic || '').trim()
    if(!id) return null

    // Guest mode switches authentication off for the whole application (see
    // requireAuth.middleware.js). Debug only; keep the behaviour aligned.
    if(config.isGuestMode) return BOARD_ROOM + id

    const user = socket.data.user
    if(!user) return null

    const board = await boardIfPermitted(id, user)
    if(board){
        socket.data.boardId = id
        return BOARD_ROOM + id
    }

    const openBoardId = socket.data.boardId
    if(!openBoardId) return null
    const parent = await boardIfPermitted(openBoardId, user)
    if(!parent || !boardHasTask(parent, id)) return null
    return TASK_ROOM + openBoardId + ':' + id
}

/* ---------------------------------------------------------------- set-up -- */

function setupSocketAPI(http){
    gIo = require('socket.io')(http, {
        // The same list the REST API uses. In production the frontend is
        // served by this very server, so same-origin is enough and the list
        // is empty.
        cors: {
            origin: config.allowedOrigins && config.allowedOrigins.length
                ?config.allowedOrigins
                :false,
            credentials: true
        }
    })

    gIo.use(async (socket, next) => {
        try {
            socket.data.user = await identify(socket.handshake)
        } catch(err) {
            // A socket that cannot be identified connects as anonymous rather
            // than not at all — see identify.
            logger.error('cannot identify a socket', err)
            socket.data.user = null
        }
        socket.data.room = null
        socket.data.boardId = null
        next()
    })

    gIo.on('connection', socket => {
        const who = () => (socket.data.user?socket.data.user._id:'anonymous')
        logger.info(`Socket connected [id: ${socket.id}, user: ${who()}]`)

        // Anything addressed at this person goes here, whichever tab it is.
        if(socket.data.user) socket.join(USER_ROOM + String(socket.data.user._id))

        socket.on('disconnect', () => {
            logger.info(`Socket disconnected [id: ${socket.id}]`)
        })

        socket.on('chat-set-topic', async topic => {
            let room = null
            try {
                room = await resolveRoom(socket, topic)
            } catch(err) {
                logger.error(`Could not resolve topic ${topic}`, err)
            }

            if(!room){
                logger.warn(`Socket [id: ${socket.id}, user: ${who()}] refused topic ${topic}`)
                // Say so instead of going quiet. A refused socket otherwise
                // looks exactly like a working one that nobody is posting to,
                // which is miserable to debug.
                socket.emit('socket-denied', {topic: String(topic || '')})
                return
            }

            if(socket.data.room === room) return
            if(socket.data.room) socket.leave(socket.data.room)
            socket.join(room)
            socket.data.room = room
            logger.info(`Socket [id: ${socket.id}] joined ${room}`)
        })

        socket.on('chat-send-msg', msg => {
            const room = socket.data.room
            if(!room) return refuse(socket, 'chat-send-msg')
            socket.broadcast.to(room).emit('chat-add-msg', msg)
        })

        // 'board-send-update' was here. A client sending the others its own
        // idea of a board is gone for good — the service layer emits the board
        // it has just read back instead, which is the only version anybody can
        // check. Nothing takes its place: a client that still sends this is
        // simply not listened to.

        // Kept for the existing client. The id it sends is ignored — the
        // cookie decides. A mismatch is worth a line in the log.
        socket.on('set-user-socket', claimedId => {
            const user = socket.data.user
            if(!user){
                // This socket was opened before the login cookie existed. The
                // client has to reconnect before the new cookie is seen; see
                // HANDOVER.md for the three lines that do it.
                socket.emit('auth-stale')
                return
            }
            if(claimedId && String(claimedId) !== String(user._id)){
                logger.warn(`Socket [id: ${socket.id}] claimed user ${claimedId}, cookie says ${user._id}`)
            }
        })

        socket.on('unset-user-socket', () => {
            if(socket.data.user) socket.leave(USER_ROOM + String(socket.data.user._id))
            if(socket.data.room) socket.leave(socket.data.room)
            socket.data.room = null
            socket.data.boardId = null
            socket.data.user = null
        })
    })
}

function refuse(socket, event){
    logger.warn(`Socket [id: ${socket.id}] sent ${event} without an authorised room`)
    socket.emit('socket-denied', {event})
}

/* --------------------------------------------------------------- sending -- */

/** Send to one person — every tab they have open, none if they have none. */
function emitToUser({type, data, userId}){
    const id = String(userId)
    logger.info(`Emitting ${type} to user ${id}`)
    gIo.to(USER_ROOM + id).emit(type, data)
}

/**
 * Cut somebody's live connections.
 *
 * Called when an account is switched off. Without it a browser already sitting
 * in a board room keeps receiving the pushes that follow an automation — the
 * door is locked and somebody is still standing inside.
 */
function disconnectUser(userId){
    if(!gIo) return
    gIo.to(USER_ROOM + String(userId)).disconnectSockets(true)
}

/**
 * Send to everyone looking at one board, the sender included.
 *
 * The one place where the server tells the browsers what happened instead of
 * one browser telling the others. It exists because an automation runs after
 * the response has already gone out: nobody is waiting for it, so nobody would
 * ever learn about it.
 *
 * `args` is a list because the board update carries two — see the note at
 * loadSocketBoard in the frontend. Sending one where two are expected leaves
 * the second `undefined`, and the reducer spreads that into an empty board.
 */
function emitToBoard({type, boardId, args = []}){
    if(!gIo) return
    gIo.to(BOARD_ROOM + String(boardId)).emit(type, ...args)
}

/**
 * To everyone who has this task open.
 *
 * A socket is in exactly one room at a time, and a client with a task dialog
 * open is in that task's room rather than the board's (see resolveRoom). So
 * anything that only matters inside the dialog — a reaction, for instance —
 * has to go here; sending it to the board would reach precisely the people who
 * cannot see it.
 */
function emitToTask({type, boardId, taskId, args = []}){
    if(!gIo) return
    gIo.to(TASK_ROOM + String(boardId) + ':' + String(taskId)).emit(type, ...args)
}

/**
 * Send to everyone but the given user — in one room, or everywhere.
 *
 * Unused today. It is the way out of the client-to-client relay described at
 * the top of this file: the service layer emits after a write, instead of one
 * browser telling the others what it thinks happened.
 */
async function broadcast({type, data, room = null, userId}){
    const id = String(userId)
    const exclude = await findUserSocket(id)

    if(room && exclude) return exclude.broadcast.to(room).emit(type, data)
    if(exclude) return exclude.broadcast.emit(type, data)
    if(room) return gIo.to(room).emit(type, data)
    return gIo.emit(type, data)
}

async function findUserSocket(userId){
    const sockets = await gIo.fetchSockets()
    return sockets.find(s => s.data && s.data.user && String(s.data.user._id) === userId)
}

module.exports = {
    setupSocketAPI,
    emitToUser,
    emitToBoard,
    emitToTask,
    disconnectUser,
    broadcast,
    USER_ROOM,
    // Exported so the tests can reach the pure parts without a live server.
    readCookie,
    boardHasTask,
    BOARD_ROOM,
    TASK_ROOM
}
