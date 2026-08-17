import {httpService} from './http.service'

const BASE_URL = 'automation'

/**
 * The rules of one board.
 *
 * Every call is owner-only on the server; there is no client-side check here
 * beyond hiding the button, because a hidden button is not a permission.
 */
export const automationService = {
    query(boardId){
        return httpService.get(`${BASE_URL}/board/${boardId}`)
    },

    runs(boardId, limit = 50){
        return httpService.get(`${BASE_URL}/board/${boardId}/runs?limit=${limit}`)
    },

    create(boardId, rule){
        return httpService.post(`${BASE_URL}/board/${boardId}`, rule)
    },

    update(id, patch){
        return httpService.put(`${BASE_URL}/${id}`, patch)
    },

    remove(id){
        return httpService.delete(`${BASE_URL}/${id}`)
    }
}
