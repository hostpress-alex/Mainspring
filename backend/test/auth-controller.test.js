/**
 * Does the login endpoint actually use the rate limit?
 *
 * login-throttle.test.js proves the counting is right. This one proves it is
 * wired in: that a refusal comes back as 429 with a Retry-After header, that a
 * correct password clears the count, and that the limit is checked before the
 * password is, so a blocked address cannot keep the database busy.
 *
 * auth.service is replaced through the module cache, so no database and no
 * bcrypt are involved.
 */
const test = require('node:test')
const assert = require('node:assert')

const authServicePath = require.resolve('../api/auth/auth.service')

let loginCalls = 0
let loginSucceeds = false

require.cache[authServicePath] = {
    id: authServicePath,
    filename: authServicePath,
    loaded: true,
    exports: {
        async login(username) {
            loginCalls++
            if (!loginSucceeds) throw new Error('Invalid username or password')
            return { _id: 'u1', username, fullname: 'Test', isAdmin: false }
        },
        getLoginToken: () => 'a-token',
        validateToken: () => null,
        signup: async () => ({}),
    },
}

const controller = require('../api/auth/auth.controller')
const throttle = require('../services/login-throttle.service')

/** Just enough of an Express response to record what the controller did. */
function fakeRes() {
    const res = {
        statusCode: 200,
        body: null,
        headers: {},
        cookies: {},
        status(code) { this.statusCode = code; return this },
        set(name, value) { this.headers[name.toLowerCase()] = value; return this },
        send(body) { this.body = body; return this },
        json(body) { this.body = body; return this },
        cookie(name, value) { this.cookies[name] = value; return this },
    }
    return res
}

const reqFrom = (ip, username, password = 'wrong') => ({ ip, body: { username, password } })

async function attempt(ip, username, password) {
    const res = fakeRes()
    await controller.login(reqFrom(ip, username, password), res)
    return res
}

test.beforeEach(() => {
    throttle.reset()
    loginCalls = 0
    loginSucceeds = false
})

test('a wrong password answers 401', async () => {
    const res = await attempt('5.5.5.5', 'alex')
    assert.strictEqual(res.statusCode, 401)
})

test('a right password answers 200 and sets the cookie', async () => {
    loginSucceeds = true
    const res = await attempt('5.5.5.5', 'alex', 'correct')
    assert.strictEqual(res.statusCode, 200)
    assert.ok(res.cookies.loginToken, 'expected a loginToken cookie')
})

test('too many wrong passwords answer 429 with Retry-After', async () => {
    for (let i = 0; i < throttle.MAX_PER_ACCOUNT; i++) await attempt('5.5.5.5', 'alex')

    const res = await attempt('5.5.5.5', 'alex')
    assert.strictEqual(res.statusCode, 429)
    assert.strictEqual(res.body.code, 'TOO_MANY_ATTEMPTS')
    assert.ok(Number(res.headers['retry-after']) > 0, 'Retry-After has to carry a number of seconds')
    assert.ok(res.body.retryAfter > 0)
})

test('a blocked attempt never reaches the password check', async () => {
    for (let i = 0; i < throttle.MAX_PER_ACCOUNT; i++) await attempt('5.5.5.5', 'alex')
    const before = loginCalls

    await attempt('5.5.5.5', 'alex')
    assert.strictEqual(loginCalls, before,
        'the limit has to be checked first, otherwise a blocked address still costs a bcrypt round')
})

test('the cookie is httpOnly and sameSite Lax', async () => {
    // Anything less and a script on the page can read the session, or it
    // travels along with a cross-site request.
    loginSucceeds = true
    const res = fakeRes()
    let options = null
    res.cookie = (name, value, opts) => { options = opts; return res }

    await controller.login(reqFrom('5.5.5.5', 'alex', 'correct'), res)
    assert.strictEqual(options.httpOnly, true)
    assert.strictEqual(options.sameSite, 'Lax')
})

test('a correct password clears the failures collected so far', async () => {
    // Nine wrong ones, then the right one. The count has to go back to zero,
    // otherwise a bad morning slowly locks somebody out over a whole day.
    for (let i = 0; i < throttle.MAX_PER_ACCOUNT - 1; i++) await attempt('5.5.5.5', 'alex')

    loginSucceeds = true
    assert.strictEqual((await attempt('5.5.5.5', 'alex', 'correct')).statusCode, 200)

    loginSucceeds = false
    for (let i = 0; i < throttle.MAX_PER_ACCOUNT - 1; i++) {
        assert.strictEqual((await attempt('5.5.5.5', 'alex')).statusCode, 401,
            `blocked again after ${i} failures, so the counter was not cleared`)
    }
})

test('once blocked, even the right password has to wait it out', async () => {
    // Surprising the first time you hit it, and deliberate: the limit is
    // checked before the password, so there is no way to try. Whoever gets
    // locked out waits, right password or not.
    for (let i = 0; i < throttle.MAX_PER_ACCOUNT; i++) await attempt('8.8.8.8', 'alex')

    loginSucceeds = true
    assert.strictEqual((await attempt('8.8.8.8', 'alex', 'correct')).statusCode, 429)
})

test('blocking one account does not block another from the same address', async () => {
    for (let i = 0; i < throttle.MAX_PER_ACCOUNT; i++) await attempt('6.6.6.6', 'alex')

    assert.strictEqual((await attempt('6.6.6.6', 'alex')).statusCode, 429)
    assert.strictEqual((await attempt('6.6.6.6', 'sascha')).statusCode, 401)
})

test('the answer to a wrong password says nothing about whether the account exists', async () => {
    const unknown = await attempt('7.7.7.7', 'no-such-user')
    const known = await attempt('7.7.7.7', 'alex')
    assert.deepStrictEqual(unknown.body, known.body)
    assert.strictEqual(unknown.statusCode, known.statusCode)
})
