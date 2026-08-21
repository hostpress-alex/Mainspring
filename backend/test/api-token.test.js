/**
 * API tokens.
 *
 * The same three questions the session store answers — is the value
 * unguessable, can it be read back out of the table, does taking it away stop
 * it — plus the two that only apply to a key a script holds: it must not time
 * out from being unused, and revoking must not look any different from a key
 * that never existed.
 *
 * The database is a Map, as in session-token.test.js: what is under test is
 * the hashing and the shape of the answers, not knex.
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
    let matchesExtra = () => true
    const matches = row => Object.entries(filter).every(([k, v]) => row[k] === v)
        && (!compare || (compare.op === '>'?row[compare.col] > compare.value:true))
        && matchesExtra(row)

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
    q.whereNull = col => {
        filter = {...filter}
        const previous = matchesExtra
        matchesExtra = row => previous(row) && (row[col] === null || row[col] === undefined)
        return q
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

/**
 * Only `db` is faked. Everything else comes from the real module.
 *
 * The first version listed the exports by hand, and the day `msOrNull` moved
 * into knex.js this file failed with "msOrNull is not a function" — a stub that
 * has to be kept in step with the thing it stubs will drift, and it drifts by
 * breaking tests that have nothing to do with the change. Requiring the real
 * module costs nothing here: `db()` opens the connection on first CALL, not on
 * load, and it is never called.
 */
const realKnex = require('../db/knex')

require.cache[knexPath] = {
    id: knexPath, filename: knexPath, loaded: true,
    // `db()` hands back something you call with a table name — db()('api_token').
    exports: {...realKnex, db: () => () => table()}
}

const tokenRepo = require('../services/api-token.repo')

test.beforeEach(() => rows.clear())

/* --------------------------------------------------------------- making -- */

test('the token is long, random and says what it is', async () => {
    const a = await tokenRepo.create('u1')
    const b = await tokenRepo.create('u1')
    // The prefix is not decoration: a key that says what it is gets recognised
    // in a log or a config file instead of being mistaken for a hash.
    assert.match(a.token, /^msp_[a-f0-9]{64}$/)
    assert.notStrictEqual(a.token, b.token)
})

test('the raw token is never stored', async () => {
    const {token} = await tokenRepo.create('u1')
    const stored = [...rows.keys()]
    assert.strictEqual(stored.length, 1)
    assert.ok(!stored.includes(token))
    assert.strictEqual(stored[0], crypto.createHash('sha256').update(token).digest('hex'))
})

test('enough of it is kept in the clear to tell two apart', async () => {
    const {token, entry} = await tokenRepo.create('u1', {name: 'Monitoring'})
    assert.ok(token.startsWith(entry.prefix))
    assert.strictEqual(entry.prefix.length, 'msp_'.length + 8)
    assert.strictEqual(entry.name, 'Monitoring')
    // ...and not so much that the prefix is the key.
    assert.ok(entry.prefix.length < token.length / 2)
})

/* -------------------------------------------------------------- reading -- */

test('a token finds its row', async () => {
    const {token} = await tokenRepo.create('u7', {name: 'Import'})
    const found = await tokenRepo.find(token)
    assert.strictEqual(found.userId, 'u7')
    assert.strictEqual(found.name, 'Import')
})

test('a token nobody issued finds nothing', async () => {
    await tokenRepo.create('u1')
    assert.strictEqual(await tokenRepo.find('msp_' + 'f'.repeat(64)), null)
    assert.strictEqual(await tokenRepo.find(''), null)
    assert.strictEqual(await tokenRepo.find(undefined), null)
})

test('it does not go stale from being left alone', async () => {
    // The difference from a session, and the whole reason this is its own
    // table: a nightly job may not run for six weeks and must still work.
    const {token} = await tokenRepo.create('u1')
    const row = [...rows.values()][0]
    row.created_at = Date.now() - 400 * 24 * 60 * 60 * 1000
    row.last_used_at = row.created_at
    assert.ok(await tokenRepo.find(token))
})

test('an expiry that has passed refuses it', async () => {
    const {token} = await tokenRepo.create('u1', {expiresAt: Date.now() - 1})
    assert.strictEqual(await tokenRepo.find(token), null)
})

test('no expiry means until revoked', async () => {
    const {token} = await tokenRepo.create('u1', {expiresAt: null})
    assert.ok(await tokenRepo.find(token))
})

/* ------------------------------------------------------------- revoking -- */

test('revoking stops it at once', async () => {
    const {token, entry} = await tokenRepo.create('u1')
    await tokenRepo.revoke(entry.id)
    assert.strictEqual(await tokenRepo.find(token), null)
})

test('a revoked token keeps its row', async () => {
    // A deleted row answers "there was never such a key". The question after
    // an incident is "what was this, whose was it, when did we take it away".
    const {entry} = await tokenRepo.create('u1', {name: 'Alt'})
    await tokenRepo.revoke(entry.id)
    assert.strictEqual(rows.size, 1)
    const list = await tokenRepo.findForUser('u1')
    assert.strictEqual(list.length, 1)
    assert.ok(list[0].revokedAt > 0)
})

test('revoking twice does not move the date', async () => {
    const {entry} = await tokenRepo.create('u1')
    await tokenRepo.revoke(entry.id)
    const first = (await tokenRepo.findForUser('u1'))[0].revokedAt
    await tokenRepo.revoke(entry.id)
    assert.strictEqual((await tokenRepo.findForUser('u1'))[0].revokedAt, first)
})

/* ----------------------------------------------------------------- use -- */

test('the first use is recorded', async () => {
    const {token, entry} = await tokenRepo.create('u1')
    assert.strictEqual(entry.lastUsedAt, null, 'never used is its own answer')
    await tokenRepo.touch(await tokenRepo.find(token))
    assert.ok((await tokenRepo.findForUser('u1'))[0].lastUsedAt > 0)
})

test('a busy script does not write on every call', async () => {
    const {token} = await tokenRepo.create('u1')
    const found = await tokenRepo.find(token)
    await tokenRepo.touch(found)
    const first = (await tokenRepo.findForUser('u1'))[0].lastUsedAt
    await tokenRepo.touch({...found, lastUsedAt: Date.now()})
    assert.strictEqual((await tokenRepo.findForUser('u1'))[0].lastUsedAt, first)
})

test('one account can hold several', async () => {
    await tokenRepo.create('u1', {name: 'A'})
    await tokenRepo.create('u1', {name: 'B'})
    await tokenRepo.create('u2', {name: 'C'})
    assert.strictEqual((await tokenRepo.findForUser('u1')).length, 2)
    assert.strictEqual((await tokenRepo.findForUser('u2')).length, 1)
})
