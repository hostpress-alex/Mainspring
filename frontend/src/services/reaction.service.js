import {httpService} from './http.service'

const BASE_URL = 'reaction'

/**
 * Reactions on updates and replies.
 *
 * The set is fixed, here and on the server. Not out of distrust — a free
 * picker fills a thread with one-offs nobody can scan, and the whole point of
 * a reaction is that the same few symbols repeat and can be counted at a
 * glance. Six is what fits in a row without a scroll bar.
 */
export const REACTIONS = ['👍', '👏', '🙏', '❤️', '😄', '✅']

export const reactionService = {
    /** Every reaction on a task, grouped by comment and emoji. */
    forTask(boardId, taskId){
        return httpService.get(`${BASE_URL}/task/${boardId}/${taskId}`)
    },

    /** On if it was off, off if it was on. */
    toggle(boardId, taskId, commentId, emoji){
        return httpService.put(`${BASE_URL}/${boardId}/${taskId}/${commentId}`, {emoji})
    }
}
