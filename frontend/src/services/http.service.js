import Axios from 'axios'

// Always relative: in dev the Vite proxy forwards to :3030,
// in production the same Express process serves frontend and API.
const BASE_URL = '/api/'


var axios = Axios.create({
    withCredentials: true
})

export const httpService = {
    get (endpoint, data) {
        return ajax(endpoint, 'GET', data)
    },
    post (endpoint, data) {
        return ajax(endpoint, 'POST', data)
    },
    put (endpoint, data) {
        return ajax(endpoint, 'PUT', data)
    },
    patch (endpoint, data) {
        return ajax(endpoint, 'PATCH', data)
    },
    delete (endpoint, data) {
        return ajax(endpoint, 'DELETE', data)
    }
}

async function ajax (endpoint, method = 'GET', data = null) {
    try {
        const res = await axios({
            url: `${BASE_URL}${endpoint}`,
            method,
            data,
            params: (method === 'GET') ? data : null
        })
        return res.data
    } catch (err) {
        console.log(`Had Issues ${method}ing to the backend, endpoint: ${endpoint}, with data: `, data)
        console.dir(err)
        if (err.response && err.response.status === 401) {
            sessionStorage.clear()
            // Do not redirect if we are already on the login page —
            // otherwise the reload swallows the error from the login attempt.
            if (!window.location.pathname.startsWith('/auth/')) {
                window.location.assign('/auth/login')
            }
        }
        throw err
    }
}