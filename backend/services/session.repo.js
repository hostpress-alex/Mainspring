/**
 * Sessions, as rows.
 *
 * The value in the cookie never touches this table: what is stored is its
 * SHA-256. A copy of this table is therefore not a set of working cookies, for
 * the same reason a password column holds a hash.
 *
 * Everything here works on the RAW token and hashes on the way in, so no
 * caller has to remember to. A caller that hashes for itself is one that will
 * one day forget.
 */
const crypto = require('crypto')
const {db} = require('../db/knex')

const sid = v => (v === undefined || v === null)?'':String(v)

/**
 * How long a session lives without being used.
 *
 * Every request pushes it out again (see `touch`), so this is an idle timeout
 * rather than a hard end: a browser somebody uses daily stays signed in, one
 * left in a hotel lobby does not.
 */
const IDLE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * How stale `last_seen_at` may get before it is written again.
 *
 * Without this every single request would be a write. Five minutes is precise
 * enough for "when was this device last used" and turns the write into a rare
 * one.
 */
const TOUCH_EVERY_MS = 5 * 60 * 1000

/** 32 random bytes. This is the whole credential — it is never derived. */
const newToken = () => crypto.randomBytes(32).toString('hex')

const keyOf = token => crypto.createHash('sha256').update(String(token)).digest('hex')

function out(row){
    if(!row) return null
    return {
        id: row.id,
        userId: row.user_id,
        createdAt: Number(row.created_at),
        lastSeenAt: Number(row.last_seen_at),
        expiresAt: Number(row.expires_at),
        userAgent: row.user_agent || '',
        ip: row.ip || ''
    }
}

/** Start a session. Returns the raw token — the only time it exists. */
async function create(userId, {userAgent = '', ip = ''} = {}){
    const token = newToken()
    const now = Date.now()
    await db()('session').insert({
        id: keyOf(token),
        user_id: sid(userId),
        created_at: now,
        last_seen_at: now,
        expires_at: now + IDLE_MS,
        user_agent: String(userAgent || '').slice(0, 255),
        ip: String(ip || '').slice(0, 45)
    })
    return {token, id: keyOf(token)}
}

/**
 * The session behind a token, or null.
 *
 * An expired row answers null and is deleted on the way past — the tidying up
 * happens where the expiry is noticed, so there is nothing to schedule.
 */
async function find(token){
    if(!token) return null
    const id = keyOf(token)
    const row = await db()('session').where({id}).first()
    if(!row) return null
    if(Number(row.expires_at) <= Date.now()){
        await db()('session').where({id}).del()
        return null
    }
    return out(row)
}

/** Push the expiry out, at most once every few minutes. */
async function touch(session){
    const now = Date.now()
    if(now - Number(session.lastSeenAt) < TOUCH_EVERY_MS) return
    await db()('session').where({id: session.id})
        .update({last_seen_at: now, expires_at: now + IDLE_MS})
}

async function remove(id){
    await db()('session').where({id: sid(id)}).del()
}

async function removeByToken(token){
    if(!token) return
    await db()('session').where({id: keyOf(token)}).del()
}

/** Sign somebody out everywhere. This is what used to be a date comparison. */
async function removeAllForUser(userId){
    await db()('session').where({user_id: sid(userId)}).del()
}

/** The devices a person is signed in on, most recently used first. */
async function findForUser(userId){
    const rows = await db()('session')
        .where({user_id: sid(userId)})
        .where('expires_at', '>', Date.now())
        .orderBy('last_seen_at', 'desc')
    return rows.map(out)
}

module.exports = {
    IDLE_MS, TOUCH_EVERY_MS,
    create, find, touch, remove, removeByToken, removeAllForUser, findForUser
}
