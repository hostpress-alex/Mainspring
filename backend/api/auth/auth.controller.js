const authService = require('./auth.service')
const throttle = require('../../services/login-throttle.service')
const logger = require('../../services/logger.service')
const config = require('../../config')

/**
 * The login cookie.
 *
 * httpOnly so that no script can read it, sameSite Lax so it does not travel
 * with cross-site requests, secure once there is TLS to be secure over.
 */
function setLoginCookie(res, user){
    res.cookie('loginToken', authService.getLoginToken(user), {
        httpOnly: true,
        sameSite: 'Lax',
        secure: process.env.NODE_ENV === 'production'
    })
}

/**
 * Where the request came from.
 *
 * Behind a reverse proxy this is only the client's address if Express has
 * been told to trust the proxy — see TRUST_PROXY in server.js. Without that,
 * every request looks like it comes from the proxy and the whole world shares
 * one rate limit bucket.
 */
const addressOf = req => req.ip || (req.socket && req.socket.remoteAddress) || 'unknown'

async function login(req, res){
    const {username, password} = req.body
    const address = addressOf(req)

    const verdict = throttle.check(address, username)
    if(!verdict.allowed){
        logger.warn(`Login blocked for ${address} (user: ${username}), ${verdict.retryAfter}s left`)
        res.set('Retry-After', String(verdict.retryAfter))
        // The frontend turns the code into a message; err is the fallback for
        // whoever is reading this in a terminal.
        return res.status(429).send({
            code: 'TOO_MANY_ATTEMPTS',
            retryAfter: verdict.retryAfter,
            err: 'Too many failed login attempts'
        })
    }

    try {
        const user = await authService.login(username, password)
        throttle.recordSuccess(address, username)
        setLoginCookie(res, user)
        logger.info(`User login: ${user.username || user.fullname}`)
        res.json(user)
    } catch(err) {
        throttle.recordFailure(address, username)
        // Deliberately not logged as an error: a mistyped password is not a
        // fault, and at error level it drowns out the ones that are.
        logger.warn(`Failed login for ${username} from ${address}`)
        res.status(401).send({err: 'Failed to Login'})
    }
}

async function signup(req, res){
    try {
        if(!config.allowSignup){
            return res.status(403).send({err: 'Registrierung ist deaktiviert'})
        }
        const credentials = req.body
        const account = await authService.signup(credentials)
        logger.debug('auth.route - new account created: ' + JSON.stringify(account))
        const user = await authService.login(credentials.username, credentials.password)
        logger.info(`User signup: ${user.username || user.fullname}`)
        setLoginCookie(res, user)
        res.json(user)
    } catch(err) {
        logger.error('Failed to signup ' + err)
        res.status(500).send({err: 'Failed to signup'})
    }
}

async function logout(req, res){
    try {
        res.clearCookie('loginToken')
        res.send({msg: 'Logged out successfully'})
    } catch(err) {
        res.status(500).send({err: 'Failed to logout'})
    }
}

module.exports = {
    login,
    signup,
    logout
}
