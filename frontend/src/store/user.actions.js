import {userService} from '../services/user.service.js'
import {store} from '../store/store.js'

// import { showErrorMsg } from '../services/event-bus.service.js'
import {LOADING_DONE, LOADING_START} from './system.reducer.js';
import {REMOVE_USER, SET_USER, SET_USERS, SET_WATCHED_USER} from './user.reducer.js';

export async function loadUsers(){
    try {
        store.dispatch({type: LOADING_START})
        const users = await userService.getUsers()
        store.dispatch({type: SET_USERS, users})
    } catch(err) {
        console.log('UserActions: err in loadUsers', err)
    } finally {
        store.dispatch({type: LOADING_DONE})
    }
}

// TODO:REMOVE THIS
export async function removeUser(userId){
    try {
        await userService.remove(userId)
        store.dispatch({type: REMOVE_USER, userId})
    } catch(err) {
        console.log('UserActions: err in removeUser', err)
    }
}

/**
 * The restore is attempted once per page load, not once per guarded route.
 *
 * Every protected route asks the same question at the same moment, and the
 * answer is the same for all of them. Holding the promise rather than a
 * "already tried" flag matters: with a flag, the second route to ask would see
 * "already tried", find no user yet, and redirect to the login page while the
 * first one was still waiting for the answer.
 */
let restoreAttempt = null

export function ensureSession(){
    if(!restoreAttempt) restoreAttempt = restoreSession()
    return restoreAttempt
}

/** Signing out invalidates the answer — otherwise it restores the old user. */
export function forgetSession(){
    restoreAttempt = null
}

/**
 * Pick the session back up from the cookie.
 *
 * Returns the user, or null if there is none. Deliberately quiet: this runs on
 * every cold start of the app, and "not signed in" is the ordinary case on the
 * login page.
 */
export async function restoreSession(){
    const user = await userService.restore()
    if(user) store.dispatch({type: SET_USER, user})
    return user
}

export async function login(credentials){
    try {
        const user = await userService.login(credentials)
        store.dispatch({
            type: SET_USER,
            user
        })
        return user
    } catch(err) {
        console.log('Cannot login', err)
        throw err
    }
}

export async function signup(credentials){
    console.log(credentials)
    try {
        const user = await userService.signup(credentials)
        store.dispatch({
            type: SET_USER,
            user
        })
        return user
    } catch(err) {
        console.log('Cannot signup', err)
        throw err
    }
}

/**
 * Changes your own profile and keeps store and sessionStorage in sync.
 * changes may contain fullname, username, imgUrl, language, password and
 * currentPassword.
 */
export async function updateProfile(userId, changes){
    const saved = await userService.update({user: {_id: userId, ...changes}})
    const localUser = userService.saveLocalUser(saved)
    store.dispatch({type: SET_USER, user: localUser})
    return localUser
}

export async function logout(){
    try {
        forgetSession()
        await userService.logout()
        store.dispatch({
            type: SET_USER,
            user: null
        })
    } catch(err) {
        console.log('Cannot logout', err)
        throw err
    }
}

export async function loadUser(userId){
    try {
        const user = await userService.getById(userId);
        store.dispatch({type: SET_WATCHED_USER, user})
    } catch(err) {
        // showErrorMsg('Cannot load user')
        console.log('Cannot load user', err)
    }
}