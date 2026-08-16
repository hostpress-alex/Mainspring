import {httpService} from './http.service'

const BASE_URL = 'notification'

/**
 * Notifications for the logged-in user.
 *
 * There is no user id in any of these calls, and that is deliberate: the
 * server takes it from the session, so there is no shape of request that asks
 * for somebody else's list.
 */
export const notificationService = {
    /** Newest first. `before` is the id of the oldest entry already on screen. */
    query({before = null, limit = 30} = {}){
        const params = new URLSearchParams()
        if(before) params.set('before', before)
        if(limit) params.set('limit', limit)
        const query = params.toString()
        return httpService.get(`${BASE_URL}${query?'?' + query:''}`)
    },

    /** Just the badge number. */
    unreadCount(){
        return httpService.get(`${BASE_URL}/unread`)
    },

    markRead(ids){
        return httpService.post(`${BASE_URL}/read`, {ids: Array.isArray(ids)?ids:[ids]})
    },

    markAllRead(){
        return httpService.post(`${BASE_URL}/read-all`, {})
    },

    isMuted(boardId, taskId){
        return httpService.get(`${BASE_URL}/subscription/${boardId}/${taskId}`)
    },

    setMuted(boardId, taskId, muted){
        return httpService.put(`${BASE_URL}/subscription/${boardId}/${taskId}`, {muted})
    }
}
