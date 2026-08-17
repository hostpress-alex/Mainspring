/**
 * The session store.
 *
 * This replaces the tests that were here for the encrypted cookie. Those
 * checked that a token had an age and that an old one was refused — sensible
 * conditions on a credential anybody with the key could mint. The credential
 * is now a random value with a row behind it, so the questions are different:
 *
 *   is the value unguessable?
 *   is it possible to get it back out of the database?
 *   does deleting the row stop it, at once?
 *
 * The database is replaced with a Map, which is enough: what is being checked
 * here is the hashing and the shape of the answers, not knex.
 */
const test = require('node:test')
const assert = require('node:assert')
const crypto = require('crypto')

const knexPath = require.resolve('../db/knex')

/** A Map pretending to be one table, through the handful of calls used. */
const rows = new Map()

function table(){
    let filter = {}
    let compare = null
    const matches = row => Object.entries(filter).every(([k, v]) => row[k] === v)
        && (!compare || (compare.op === '>'?row[compare.col] > compare.value:true))

    const q = {
        where(spec){
            filter = {...filter, ...spec}
            return q
        },
        first(){
            return Promise.resolve([...rows.values()].find(matches) || undefined)
        },
        del(){
            for(const [key, row] of [...rows]) if(matches(row)) rows.delete(key)
            return Promise.resolve()
        },
        update(patch){
            for(const row of rows.values()) if(matches(row)) Object.assign(row, patch)
            return Promise.resolve()
        },
        insert(row){
            rows.set(row.id, {...row})
            return Promise.resolve()
        },
        orderBy(){
            return Promise.resolve([...rows.values()].filter(matches))
        }
    }
    // `.where('expires_at', '>', x)` — the three-argument form.
    const where = q.where
    q.where = (...args) => {
        if(args.length === 3){
            compare = {col: args[0], op: args[1], value: args[2]}
            return q
        }
        return where(args[0])
    }
    return q
}

require.cache[knexPath] = {
    id: knexPath, filename: knexPath, loaded: true,
    // `db()` hands back something you call with a table name — db()('session').
    exports: {db: () => () => table(), parseJson: v => v, toJson: v => v}
}

const sessionRepo = require('../services/session.repo')

test.beforeEach(() => rows.clear())

/* --------------------------------------------------------------- making -- */

test('the token is long and random', async () => {
    const a = await sessionRepo.create('u1')
    const b = await sessionRepo.create('u1')
    assert.match(a.token, /^[a-f0-9]{64}$/, '32 bytes, hex')
    assert.notStrictEqual(a.token, b.token)
})

test('the raw token is never stored', async () => {
    // A copy of this table must not be a set of working cookies.
    const {token} = await sessionRepo.create('u1')
    const stored = [...rows.keys()]
    assert.strictEqual(stored.length, 1)
    assert.ok(!stored.includes(token), 'the value from the cookie is not in the table')
    assert.strictEqual(stored[0], crypto.createHash('sha256').update(token).digest('hex'))
})

/* -------------------------------------------------------------- reading -- */

test('a token finds its session', async () => {
    const {token} = await sessionRepo.create('u7', {userAgent: 'Firefox', ip: '10.0.0.1'})
    const found = await sessionRepo.find(token)
    assert.strictEqual(found.userId, 'u7')
    assert.strictEqual(found.userAgent, 'Firefox')
})

test('a token nobody issued finds nothing', async () => {
    await sessionRepo.create('u1')
    assert.strictEqual(await sessionRepo.find('f'.repeat(64)), null)
    assert.strictEqual(await sessionRepo.find(''), null)
    assert.strictEqual(await sessionRepo.find(undefined), null)
})

test('an expired session answers null and is cleared away', async () => {
    const {token} = await sessionRepo.create('u1')
    for(const row of rows.values()) row.expires_at = Date.now() - 1

    assert.strictEqual(await sessionRepo.find(token), null)
    assert.strictEqual(rows.size, 0, 'and the row does not stay behind')
})

/* ----------------------------------------------------------- taking away -- */

test('signing out stops that token at once', async () => {
    const {token} = await sessionRepo.create('u1')
    await sessionRepo.removeByToken(token)
    assert.strictEqual(await sessionRepo.find(token), null)
})

test('signing out everywhere leaves other people alone', async () => {
    const mine = await sessionRepo.create('u1')
    const alsoMine = await sessionRepo.create('u1')
    const theirs = await sessionRepo.create('u2')

    await sessionRepo.removeAllForUser('u1')

    assert.strictEqual(await sessionRepo.find(mine.token), null)
    assert.strictEqual(await sessionRepo.find(alsoMine.token), null)
    assert.ok(await sessionRepo.find(theirs.token), 'somebody else stays signed in')
})

/* ------------------------------------------------------------- touching -- */

test('the expiry is not written on every single request', async () => {
    // Otherwise every request is a write.
    const {token} = await sessionRepo.create('u1')
    const session = await sessionRepo.find(token)
    const before = [...rows.values()][0].expires_at

    await sessionRepo.touch(session)
    assert.strictEqual([...rows.values()][0].expires_at, before, 'just used, nothing written')

    // Marked as if it were about to run out. Without this the second touch
    // writes the same millisecond it started with and there is nothing to see.
    ;[...rows.values()][0].expires_at = before - 60_000
    await sessionRepo.touch({...session, lastSeenAt: Date.now() - sessionRepo.TOUCH_EVERY_MS - 1})
    assert.strictEqual([...rows.values()][0].expires_at, before,
        'and after a while the expiry is pushed out again')
})
