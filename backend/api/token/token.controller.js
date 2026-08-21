const apiTokenRepo = require('../../services/api-token.repo')
const userService = require('../user/user.service')
const logger = require('../../services/logger.service')
const asyncLocalStorage = require('../../services/als.service')

/**
 * Minting and revoking API tokens.
 *
 * Admin only, and session only — see requireSession on the routes. A token
 * that can mint tokens cannot be revoked: you take one away and the two it
 * made are still there.
 */

function requester(){
    const store = asyncLocalStorage.getStore()
    return (store && store.loggedinUser) || null
}

/** A year, when the caller does not say. Not "never": a key nobody ever looks
 *  at again is the one still working three jobs after the person who made it
 *  left. It can be renewed in one call. */
const DEFAULT_TTL_MS = 365 * 24 * 60 * 60 * 1000

/**
 * The longest a token may live.
 *
 * Five years is already long enough that the expiry is nearly a formality —
 * it is a backstop against a key outliving the person who made it, not a
 * security control. The interface offers 1, 2, 3 and 5; this is the ceiling
 * that list has to stay under.
 */
const MAX_TTL_MS = 5 * 365 * 24 * 60 * 60 * 1000

/**
 * Every token on the system.
 *
 * Admin and session only, like everything else here. It carries `userId` per
 * row rather than the owner's name: the administration already has the user
 * list loaded, and a name copied into this answer would go stale the day
 * somebody is renamed.
 */
async function listAllTokens(req, res){
    try {
        const list = await apiTokenRepo.findAll()
        res.send({tokens: list})
    } catch(err) {
        logger.error('cannot list api tokens', err)
        res.status(500).send({err: 'Tokens konnten nicht gelesen werden'})
    }
}

async function listTokens(req, res){
    try {
        const list = await apiTokenRepo.findForUser(req.params.userId)
        res.send({tokens: list})
    } catch(err) {
        logger.error('cannot list api tokens', err)
        res.status(500).send({err: 'Tokens konnten nicht gelesen werden'})
    }
}

async function createToken(req, res){
    const {userId} = req.params
    const {name = '', ttlMs} = req.body || {}
    try {
        // The account has to exist and be usable. A token for a closed account
        // would be a key to a door that has been bricked up — it would simply
        // fail at the next request with no hint as to why.
        const owner = await userService.getById(userId)
        if(!owner) return res.status(404).send({err: 'Benutzer nicht gefunden'})

        // Refused, not clamped. A silent `Math.min` is how the interface came
        // to offer five years while the server handed out two, with nothing
        // anywhere saying so — the caller asked for something it did not get
        // and was told it had succeeded.
        const ttl = Number(ttlMs)
        if(Number.isFinite(ttl) && ttl > MAX_TTL_MS){
            return res.status(400).send({
                err: `Ein Token darf hoechstens ${Math.round(MAX_TTL_MS / (365 * 24 * 60 * 60 * 1000))} Jahre gelten`
            })
        }
        const life = Number.isFinite(ttl) && ttl > 0?ttl:DEFAULT_TTL_MS

        const {token, entry} = await apiTokenRepo.create(userId, {
            name,
            createdById: requester()?requester()._id:null,
            expiresAt: Date.now() + life
        })

        logger.info(`api token ${entry.prefix}… created for ${userId} by ${requester()?requester()._id:'?'}`)
        // The only time the raw value exists outside the caller's script. It
        // is not stored and cannot be shown again — which is the point, and
        // which the interface has to say plainly.
        res.send({token, entry})
    } catch(err) {
        logger.error('cannot create an api token', err)
        res.status(500).send({err: 'Token konnte nicht angelegt werden'})
    }
}

async function revokeToken(req, res){
    try {
        await apiTokenRepo.revoke(req.params.tokenId)
        logger.info(`api token revoked by ${requester()?requester()._id:'?'}`)
        res.send({ok: true})
    } catch(err) {
        logger.error('cannot revoke an api token', err)
        res.status(500).send({err: 'Token konnte nicht widerrufen werden'})
    }
}

module.exports = {DEFAULT_TTL_MS, MAX_TTL_MS, listAllTokens, listTokens, createToken, revokeToken}
