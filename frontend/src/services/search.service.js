import {httpService} from './http.service'

/**
 * The global search.
 *
 * There is no user id in this call: the server searches as whoever is logged
 * in, and what may be found is decided in the queries themselves. A client
 * that could ask "search as somebody else" would be the whole hole.
 */
export const searchService = {
    /** `type` is 'all' or one of boards | tasks | updates | files | people. */
    query(term, type = 'all'){
        const params = new URLSearchParams({q: term, type})
        return httpService.get(`search?${params.toString()}`)
    }
}

/** Below this the server answers with nothing — the client should not ask. */
export const MIN_TERM = 2
