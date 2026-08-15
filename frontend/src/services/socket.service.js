import io from 'socket.io-client'
import {userService} from './user.service'

export const SOCKET_EVENT_ADD_MSG = 'chat-add-msg'
export const SOCKET_EMIT_SEND_MSG = 'chat-send-msg'
export const SOCKET_EVENT_ADD_UPDATE_BOARD = 'board-add-update'
export const SOCKET_EMIT_SEND_UPDATE_BOARD = 'board-send-update'
export const SOCKET_EMIT_SET_TOPIC = 'chat-set-topic'
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
                if(lastTopic) socket.emit(SOCKET_EMIT_SET_TOPIC, lastTopic)
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
            if(eventName === SOCKET_EMIT_SET_TOPIC) lastTopic = data
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
