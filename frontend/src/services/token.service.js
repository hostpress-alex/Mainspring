import {httpService} from './http.service'

const BASE_URL = 'token/'

/**
 * API tokens.
 *
 * Every call here needs an admin AND a session — the server refuses these
 * three routes to a caller holding a token, because a key that can mint keys
 * cannot be revoked. See middlewares/requireAuth (requireSession).
 *
 * Nothing in this file keeps the token it receives. `create` hands it to the
 * caller once and that is the end of it: it is not stored, not cached, and it
 * must never reach localStorage or a URL.
 */
export const tokenService = {
    /** Every token of one account, revoked ones included. */
    forUser(userId){
        return httpService.get(`${BASE_URL}user/${userId}`)
    },

    /**
     * Mint one. The answer carries the raw value — the only time it exists
     * outside the script that will use it.
     */
    create(userId, {name = '', ttlMs = null} = {}){
        return httpService.post(`${BASE_URL}user/${userId}`, {name, ttlMs})
    },

    revoke(tokenId){
        return httpService.delete(`${BASE_URL}${tokenId}`)
    }
}

/** A year in milliseconds — the offered lifetimes are multiples of this. */
export const YEAR_MS = 365 * 24 * 60 * 60 * 1000
