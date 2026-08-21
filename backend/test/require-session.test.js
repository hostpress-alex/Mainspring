/**
 * The door a token may not come through.
 *
 * This is the one rule in the token design that must not be wrong: a key that
 * can mint keys cannot be revoked — you take one away and the two it made are
 * still there. Same for anything that changes a person, because that is how a
 * stolen key keeps itself alive.
 *
 * Tested here rather than by hand against a running server, because "I could
 * not check it, I trust you" is not a state this particular rule should be
 * left in.
 */
const test = require('node:test')
const assert = require('node:assert')
const asyncLocalStorage = require('../services/als.service')
const {requireSession} = require('../middlewares/requireAuth.middleware')

/** A response that records what was done to it. */
function fakeRes(){
    const res = {statusCode: null, body: null}
    res.status = code => {
        res.statusCode = code
        return res
    }
    res.send = body => {
        res.body = body
        return res
    }
    return res
}

const run = (store, req = {}) => new Promise(resolve => {
    asyncLocalStorage.run(store, () => {
        const res = fakeRes()
        let passed = false
        requireSession({originalUrl: '/api/token/user/u1', ...req}, res, () => { passed = true })
        resolve({passed, res})
    })
})

test('a caller holding a token is refused', async () => {
    const {passed, res} = await run({apiTokenId: 'abc', loggedinUser: {_id: 'u1', isAdmin: true}})
    assert.strictEqual(passed, false, 'must not reach the route')
    assert.strictEqual(res.statusCode, 403)
})

test('the refusal says why', async () => {
    // 403 and a reason, not a silent 401. Unlike a wrong key this is not a
    // secret, and a script author staring at 401 would hunt the wrong problem.
    const {res} = await run({apiTokenId: 'abc', loggedinUser: {_id: 'u1'}})
    assert.match(String(res.body && res.body.err), /API-Token/)
})

test('being an admin does not help', async () => {
    // The integration account could be an admin one day. The rule is about
    // HOW the caller authenticated, not about what they are allowed.
    const {passed} = await run({apiTokenId: 'abc', loggedinUser: {_id: 'u1', isAdmin: true}})
    assert.strictEqual(passed, false)
})

test('a session goes through', async () => {
    const {passed, res} = await run({sessionId: 's1', loggedinUser: {_id: 'u1', isAdmin: true}})
    assert.strictEqual(passed, true)
    assert.strictEqual(res.statusCode, null)
})

test('no store at all does not throw', async () => {
    // requireAuth runs first and would already have refused; this only has to
    // not fall over.
    const res = fakeRes()
    let passed = false
    requireSession({originalUrl: '/x'}, res, () => { passed = true })
    assert.strictEqual(passed, true)
})
