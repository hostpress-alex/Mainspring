import io from 'socket.io-client'
import {userService} from './user.service'

export const SOCKET_EVENT_ADD_MSG = 'chat-add-msg'
export const SOCKET_EMIT_SEND_MSG = 'chat-send-msg'
export const SOCKET_EVENT_ADD_UPDATE_BOARD = 'board-add-update'
// Somebody reacted to an update or a reply of the task this socket has open.
export const SOCKET_EVENT_REACTION_CHANGED = 'reaction-changed'
// 'board-send-update' was here: a client handing the others its own idea of a
// board. The server emits the board it has read back instead — see _pushed in
// backend/api/board/board.service.js. Nothing listens for this any more.
export const SOCKET_EMIT_SET_TOPIC = 'chat-set-topic'
// A task dialog opened or closed. Separate from the topic above because the
// two are not alternatives any anymore: a socket holds the board's room and the
// task's at the same time, which is what stopped live board updates from
// dying for as long as a dialog was open. The board id travels with the task
// id — the server used to take it from whichever board this socket had last
// joined, and a task opened from the calendar has none.
export const SOCKET_EMIT_TASK_OPEN = 'task-open'
export const SOCKET_EMIT_TASK_CLOSE = 'task-close'
export const SOCKET_EMIT_USER_WATCH = 'user-watch'

const SOCKET_EMIT_LOGIN = 'set-user-socket'
const SOCKET_EMIT_LOGOUT = 'unset-user-socket'

// Same origin — in dev the Vite proxy takes over (ws: true).
const baseUrl = ''
export const socketService = createSocketService()

// for debugging from console
window.socketService = socketService

socketService.setup()

function createSocketService(){
    var socket = null

    /**
     * The room this client last asked for.
     *
     * A reconnect starts the socket in no room at all, so without this a
     * reconnect silently stops all live updates until the next navigation.
     */
    var lastTopic = null
    var lastTask = null

    const socketService = {
        setup(){
            socket = io(baseUrl)

            /**
             * Everything that needs the outside world happens in here, not while
             * this module is being evaluated.
             *
             * user.service imports this file and this file imports user.service, so
             * reaching for `userService` at module level hits a const that does not
             * exist yet and takes the whole bundle down with a ReferenceError.
             * A connect handler runs long after both modules are in place.
             */
            socket.on('connect', () => {
                const user = userService.getLoggedinUser()
                if(user) socket.emit(SOCKET_EMIT_LOGIN, user._id)
                // Both rooms are restored, and the board first: the server
                // drops the task room when a board topic arrives, on the
                // assumption that a new board means the old dialog is gone.
                if(lastTopic) socket.emit(SOCKET_EMIT_SET_TOPIC, lastTopic)
                if(lastTask) socket.emit(SOCKET_EMIT_TASK_OPEN, lastTask)
            })

            // The server refuses a room instead of going quiet. Worth seeing.
            socket.on('socket-denied', info => console.warn('socket denied:', info))
        },
        on(eventName, cb){
            socket.on(eventName, cb)
        },
        off(eventName, cb = null){
            if(!socket) return;
            if(!cb) socket.removeAllListeners(eventName)
            else socket.off(eventName, cb)
        },
        emit(eventName, data){
            // What to say again after a reconnect. Two slots, because the
            // server holds two rooms; one variable would have restored
            // whichever happened to be last.
            if(eventName === SOCKET_EMIT_SET_TOPIC){
                lastTopic = data
                lastTask = null
            }
            if(eventName === SOCKET_EMIT_TASK_OPEN) lastTask = data
            if(eventName === SOCKET_EMIT_TASK_CLOSE) lastTask = null
            socket.emit(eventName, data)
        },
        login(userId){
            // The handshake is a snapshot taken when the socket connected — which
            // was before this login, so the server still sees an anonymous client.
            // Reconnect so it gets the new cookie.
            socket.disconnect().connect()
            socket.emit(SOCKET_EMIT_LOGIN, userId)
        },
        logout(){
            socket.emit(SOCKET_EMIT_LOGOUT)
            lastTopic = null
            lastTask = null
            socket.disconnect().connect()
        },
        terminate(){
            socket = null
        }

    }
    return socketService
}

// eslint-disable-next-line
function createDummySocketService(){
    var listenersMap = {}
    const socketService = {
        listenersMap,
        setup(){
            listenersMap = {}
        },
        terminate(){
            this.setup()
        },
        login(){
        },
        logout(){
        },
        on(eventName, cb){
            listenersMap[eventName] = [...(listenersMap[eventName]) || [], cb]
        },
        off(eventName, cb){
            if(!listenersMap[eventName]) return
            if(!cb) delete listenersMap[eventName]
            else listenersMap[eventName] = listenersMap[eventName].filter(l => l !== cb)
        },
        emit(eventName, data){
            if(!listenersMap[eventName]) return
            listenersMap[eventName].forEach(listener => {
                listener(data)
            })
        },
        // Functions for easy testing of pushed data
        testChatMsg(){
            this.emit(SOCKET_EVENT_ADD_MSG, {from: 'Someone', txt: 'Aha it worked!'})
        }
        // testUserUpdate() {
        //   this.emit(SOCKET_EVENT_USER_UPDATED, {...userService.getLoggedinUser(), score: 555})
        // }
    }
    window.listenersMap = listenersMap;
    return socketService
}

// Basic Tests
// function cb(x) {console.log('Socket Test - Expected Puk, Actual:', x)}
// socketService.on('baba', cb)
// socketService.on('baba', cb)
// socketService.on('baba', cb)
// socketService.on('mama', cb)
// socketService.emit('baba', 'Puk')
// socketService.off('baba', cb)
