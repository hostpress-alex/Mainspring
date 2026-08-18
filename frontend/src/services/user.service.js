// import { storageService } from './async-storage.service'
import {httpService} from './http.service'
import {socketService} from './socket.service'
import {rememberLanguage} from '../i18n'

const STORAGE_KEY_LOGGEDIN_USER = 'loggedinUser'
const BASE_URL = 'user/'

export const userService = {
    login,
    logout,
    signup,
    getLoggedinUser,
    restore,
    saveLocalUser,
    getUsers,
    getById,
    remove,
    logoutEverywhere,
    getSessions,
    endSession,
    setUserState,
    update,
    create,
    setAdmin
}

window.userService = userService

/**
 * Everyone who can be picked.
 *
 * `withInactive` is for the administration alone: a closed account must not
 * turn up in a member picker, and it must not be impossible to find when
 * somebody wants to open it again.
 */
function getUsers({withInactive = false} = {}){
    return httpService.get(BASE_URL + (withInactive?'?withInactive=true':''))
}

/** The devices this account is signed in on, this one marked. */
function getSessions(userId){
    return httpService.get(`${BASE_URL}${userId}/sessions`)
}

/** End one of them. */
function endSession(userId, sessionId){
    return httpService.delete(`${BASE_URL}${userId}/sessions/${sessionId}`)
}

/**
 * End every session of this account, this browser included.
 *
 * There is no list of sessions to show: the cookie is the session, so the only
 * honest control is "none of the old ones count any more".
 */
function logoutEverywhere(userId){
    return httpService.put(`${BASE_URL}${userId}/sessions`, {})
}

/** Close an account or open it again. Nothing is ever deleted. */
function setUserState(userId, state){
    return httpService.put(`${BASE_URL}${userId}/state`, {state})
}

async function getById(userId){
    return httpService.get(BASE_URL + userId)
}

function remove(userId){
    return httpService.delete(BASE_URL + userId)
}

async function update({user}){
    if(user._id) return httpService.put(BASE_URL + user._id, user)
    return httpService.post(BASE_URL, user)
}

/** Admins only: create a new user. */
function create(user){
    return httpService.post(BASE_URL, user)
}

/** Admins only: grant or revoke the admin flag. */
function setAdmin(userId, isAdmin){
    return httpService.put(BASE_URL + userId, {isAdmin})
}

async function login(userCred){
    const user = await httpService.post('auth/login', userCred)
    if(user){
        socketService.login(user._id)
        return saveLocalUser(user)
    }
}

async function signup(userCred){
    const user = await httpService.post('auth/signup', userCred)
    socketService.login(user._id)
    return saveLocalUser(user)
}

/**
 * Who does the cookie say we are?
 *
 * The signed-in user lives in `sessionStorage`, and `sessionStorage` is per
 * TAB: a second tab, a middle-click on a board, a restored window — all of
 * them start out empty and used to show the login form to somebody who was
 * signed in the whole time. The cookie knew; nothing asked it.
 *
 * Returns null rather than throwing when there is no session. "Nobody is
 * signed in" is an answer, not a failure, and the caller has to be able to
 * tell it apart from "the server is down".
 */
async function restore(){
    try {
        const user = await httpService.get('auth/me')
        if(!user || !user._id) return null
        // Same as after a real login: the socket handshake was made before we
        // knew who this was, so it has to be made again.
        socketService.login(user._id)
        return saveLocalUser(user)
    } catch(err) {
        return null
    }
}

async function logout(){
    sessionStorage.removeItem(STORAGE_KEY_LOGGEDIN_USER)
    socketService.logout()
    return await httpService.post('auth/logout')
}

function saveLocalUser(user){
    user = {
        _id: user._id,
        username: user.username,
        fullname: user.fullname,
        imgUrl: user.imgUrl,
        isAdmin: user.isAdmin === true,
        language: user.language || ''
    }
    sessionStorage.setItem(STORAGE_KEY_LOGGEDIN_USER, JSON.stringify(user))
    // The account decides the language; this browser keeps a copy so that the
    // next load has one before anything is fetched. Nothing switches here —
    // whoever wants the page to change says so.
    rememberLanguage(user.language)
    return user
}

function getLoggedinUser(){
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY_LOGGEDIN_USER))
}




