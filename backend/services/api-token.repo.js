/**
 * API tokens, as rows.
 *
 * Same shape as session.repo and for the same reason: everything here works on
 * the RAW token and hashes on the way in, so no caller has to remember to. A
 * caller that hashes for itself is one that will one day forget.
 *
 * The differences from a session are deliberate and both are about scripts:
 * there is no idle timeout, and revoking keeps the row.
 */
const crypto = require('crypto')
const {db, msOrNull} = require('../db/knex')

const sid = v => (v === undefined || v === null)?'':String(v)

/**
 * A visible marker in front of the secret.
 *
 * Not decoration. A key that says what it is can be recognised in a log, a
 * config file or a screenshot, and secret scanners key on exactly this kind of
 * prefix. A bare 64 characters of hex is indistinguishable from a hash and
 * gets pasted into places nobody would paste a key.
 */
const PREFIX = 'msp_'

/** How much of the token is kept in the clear, to tell two of them apart. */
const VISIBLE = 8

const newToken = () => PREFIX + crypto.randomBytes(32).toString('hex')

const keyOf = token => crypto.createHash('sha256').update(String(token)).digest('hex')

function out(row){
    if(!row) return null
    return {
        id: row.id,
        userId: row.user_id,
        name: row.name || '',
        prefix: row.prefix || '',
        createdAt: Number(row.created_at),
        createdById: row.created_by_id || null,
        lastUsedAt: row.last_used_at === null || row.last_used_at === undefined?null:Number(row.last_used_at),
        expiresAt: row.expires_at === null || row.expires_at === undefined?null:Number(row.expires_at),
        revokedAt: row.revoked_at === null || row.revoked_at === undefined?null:Number(row.revoked_at)
    }
}

/** Mint one. Returns the raw token — the only time it exists. */
async function create(userId, {name = '', createdById = null, expiresAt = null} = {}){
    const token = newToken()
    const now = Date.now()
    const row = {
        id: keyOf(token),
        user_id: sid(userId),
        name: String(name || '').slice(0, 190),
        prefix: token.slice(0, PREFIX.length + VISIBLE),
        created_at: now,
        created_by_id: createdById?sid(createdById):null,
        last_used_at: null,
        // `Number(null)` is 0 and 0 is finite, so a plain isFinite check turns
        // "no expiry" into "expired at the epoch" and the token is dead the
        // moment it is minted. Same trap as in the comment author repair.
        expires_at: msOrNull(expiresAt),
        revoked_at: null
    }
    await db()('api_token').insert(row)
    return {token, entry: out(row)}
}

/**
 * The token behind a value, or null.
 *
 * Expired and revoked answer the same as unknown. The reply must not say
 * which — telling a caller "that key existed but is revoked" confirms the key
 * to somebody who only guessed it.
 *
 * Unlike a session, an expired row is NOT deleted on the way past: the record
 * that this key existed is the point of keeping it.
 */
async function find(token){
    if(!token) return null
    const row = await db()('api_token').where({id: keyOf(token)}).first()
    if(!row) return null
    if(row.revoked_at !== null && row.revoked_at !== undefined) return null
    if(row.expires_at !== null && row.expires_at !== undefined && Number(row.expires_at) <= Date.now()) return null
    return out(row)
}

/**
 * How stale `last_used_at` may get before it is written again.
 *
 * A script can call a hundred times a minute and every call would otherwise be
 * an extra write. Five minutes answers "is this still in use" precisely
 * enough, which is the only question anybody asks of it.
 */
const TOUCH_EVERY_MS = 5 * 60 * 1000

async function touch(entry){
    const now = Date.now()
    if(entry.lastUsedAt !== null && now - Number(entry.lastUsedAt) < TOUCH_EVERY_MS) return
    await db()('api_token').where({id: entry.id}).update({last_used_at: now})
}

/** Take it away. The row stays. */
async function revoke(id){
    await db()('api_token').where({id: sid(id)}).whereNull('revoked_at')
        .update({revoked_at: Date.now()})
}

/**
 * Every token there is, newest first.
 *
 * The administration's job is to show what EXISTS, and the question asked of
 * this table — which keys are out there, whose are they, is one still in use —
 * is about all of them at once. Per-account only, which is how this started,
 * means that question can only be answered by clicking through every account
 * in turn, and an answer nobody assembles is an answer nobody has.
 */
async function findAll(){
    const rows = await db()('api_token').orderBy('created_at', 'desc')
    return rows.map(out)
}

/** Every token of one account, newest first. Revoked ones included — a list
 *  that hides them cannot answer "did we actually take that one away". */
async function findForUser(userId){
    const rows = await db()('api_token')
        .where({user_id: sid(userId)})
        .orderBy('created_at', 'desc')
    return rows.map(out)
}

module.exports = {
    PREFIX, VISIBLE, TOUCH_EVERY_MS,
    newToken, keyOf, create, find, touch, revoke, findForUser, findAll
}
