// import { storageService } from './async-storage.service'
import { httpService } from './http.service'
import { socketService } from './socket.service'

const STORAGE_KEY_LOGGEDIN_USER = 'loggedinUser'
const BASE_URL = 'user/'

export const userService = {
    login,
    logout,
    signup,
    getLoggedinUser,
    saveLocalUser,
    getUsers,
    getById,
    remove,
    update,
    create,
    setAdmin,
}

window.userService = userService

function getUsers() {
    return httpService.get(BASE_URL)
}

async function getById(userId) {
    return httpService.get(BASE_URL + userId)
}

function remove(userId) {
    return httpService.delete(BASE_URL + userId)
}

async function update({user}) {
    if (user._id) return httpService.put(BASE_URL + user._id, user)
    return httpService.post(BASE_URL, user)
}

/** Nur fuer Admins: neuen Benutzer anlegen. */
function create(user) {
    return httpService.post(BASE_URL, user)
}

/** Nur fuer Admins: Admin-Flag setzen oder entziehen. */
function setAdmin(userId, isAdmin) {
    return httpService.put(BASE_URL + userId, { isAdmin })
}

async function login(userCred) {
    const user = await httpService.post('auth/login', userCred)
    if (user) {
        socketService.login(user._id)
        return saveLocalUser(user)
    }
}

async function signup(userCred) {
    const user = await httpService.post('auth/signup', userCred)
    socketService.login(user._id)
    return saveLocalUser(user)
}

async function logout() {
    sessionStorage.removeItem(STORAGE_KEY_LOGGEDIN_USER)
    socketService.logout()
    return await httpService.post('auth/logout')
}

function saveLocalUser(user) {
    user = { _id: user._id, username: user.username, fullname: user.fullname, imgUrl: user.imgUrl, isAdmin: user.isAdmin === true }
    sessionStorage.setItem(STORAGE_KEY_LOGGEDIN_USER, JSON.stringify(user))
    return user
}

function getLoggedinUser() {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY_LOGGEDIN_USER))
}




