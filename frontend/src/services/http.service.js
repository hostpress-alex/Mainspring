import Axios from 'axios'

// Immer relativ: in Dev leitet der Vite-Proxy nach :3030 weiter,
// in Produktion liefert derselbe Express-Prozess Frontend und API aus.
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
            // Nicht umleiten, wenn wir ohnehin schon auf der Login-Seite sind —
            // sonst verschluckt der Reload die Fehlermeldung des Login-Versuchs.
            if (!window.location.pathname.startsWith('/auth/')) {
                window.location.assign('/auth/login')
            }
        }
        throw err
    }
}