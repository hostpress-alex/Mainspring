import Axios from 'axios'
import {showErrorMsg} from './user-msg.service'
import {t} from '../i18n'

// Always relative: in dev the Vite proxy forwards to :3030,
// in production the same Express process serves frontend and API.
const BASE_URL = '/api/'

var axios = Axios.create({
    withCredentials: true
})

export const httpService = {
    get(endpoint, data){
        return ajax(endpoint, 'GET', data)
    },
    post(endpoint, data){
        return ajax(endpoint, 'POST', data)
    },
    put(endpoint, data){
        return ajax(endpoint, 'PUT', data)
    },
    patch(endpoint, data){
        return ajax(endpoint, 'PATCH', data)
    },
    delete(endpoint, data){
        return ajax(endpoint, 'DELETE', data)
    }
}

/** A request that changes something. The rest only read. */
const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * What to put in front of the person, if anything.
 *
 * This is the only place in the frontend that knows a request failed AND is
 * still close enough to say what it was for. It is deliberately not in the
 * actions: there are about thirty of those, each with its own catch, and the
 * message was missing from every single one of them.
 *
 * `null` means: say nothing. Some failures are not news.
 */
export function messageFor(endpoint, method, err){
    const response = err && err.response
    const status = response && response.status

    // The request was called off — a page was left, a search box moved on.
    // Nothing failed that anybody asked for.
    if(err && (err.code === 'ERR_CANCELED' || err.name === 'CanceledError')) return null

    // 401 is already handled: the session is cleared and the login page is
    // loaded. A box on top of a page that is being replaced is noise.
    if(status === 401) return null

    // "Is anybody signed in?" answered with "no" is an answer, not a failure.
    if(String(endpoint).startsWith('auth/')) return null

    // The backend still answers with its own German sentences (about 55 of
    // them, see HANDOVER §6). While they exist they are better than anything
    // generic that could be written here — they name the thing that failed.
    // When they become codes this is the line that maps them.
    const fromServer = response && response.data && typeof response.data.err === 'string'
        ?response.data.err.trim()
        :''
    if(fromServer && fromServer.length <= 200) return fromServer

    if(!response) return t('errors.offline')
    if(status === 403) return t('errors.notAllowed')
    return WRITES.has(method)?t('errors.saveFailed'):t('errors.loadFailed')
}

async function ajax(endpoint, method = 'GET', data = null){
    try {
        const res = await axios({
            url: `${BASE_URL}${endpoint}`,
            method,
            data,
            params: (method === 'GET')?data:null
        })
        return res.data
    } catch(err) {
        console.error(`Had Issues ${method}ing to the backend, endpoint: ${endpoint}, with data: `, data, err)
        // Asking who is signed in and being told "nobody" is the answer, not
        // an accident. Without this exception the check itself would clear the
        // store and hard-navigate to the login page, which loses the path the
        // person actually asked for.
        const isSessionCheck = String(endpoint).startsWith('auth/me')

        if(err.response && err.response.status === 401 && !isSessionCheck){
            sessionStorage.clear()
            // Do not redirect if we are already on the login page —
            // otherwise the reload swallows the error from the login attempt.
            if(!window.location.pathname.startsWith('/auth/')){
                window.location.assign('/auth/login')
            }
        }

        // Said, not swallowed. Everything above this line existed before and
        // ended with the throw — which every caller then caught and printed to
        // a console nobody has open.
        const msg = messageFor(endpoint, method, err)
        if(msg) showErrorMsg(msg)

        throw err
    }
}
