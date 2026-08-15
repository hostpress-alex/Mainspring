const express = require('express')
const cors = require('cors')
const path = require('path')
const cookieParser = require('cookie-parser')

const app = express()
const http = require('http').createServer(app)

const config = require('./config')

// Express app config
if (config.trustProxy) app.set('trust proxy', true)
app.use(cookieParser())
// The 100kb default is enough for neither large board documents nor profile
// pictures.
app.use(express.json({ limit: '2mb' }))

if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'public')))
}

// The allowed origins live in config, because the socket needs the very same
// list. Keeping two lists is how the socket ended up accepting every origin
// while the API accepted three.
if (config.allowedOrigins.length) {
    app.use(cors({ origin: config.allowedOrigins, credentials: true }))
}

const authRoutes = require('./api/auth/auth.routes')
const userRoutes = require('./api/user/user.routes')
const boardRoutes = require('./api/board/board.routes')
const uploadRoutes = require('./api/upload/upload.routes')
const scheduleRoutes = require('./api/schedule/schedule.routes')
const { setupSocketAPI } = require('./services/socket.service')

// routes
const setupAsyncLocalStorage = require('./middlewares/setupAls.middleware')
app.all('/*splat', setupAsyncLocalStorage)

app.use('/api/auth', authRoutes)
app.use('/api/user', userRoutes)
app.use('/api/board', boardRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/schedule', scheduleRoutes)
setupSocketAPI(http)

app.get('/*splat', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

const logger = require('./services/logger.service')
const port = process.env.PORT || 3030

/**
 * Check first, listen second.
 *
 * A server that comes up on half a schema is very hard to debug later:
 * reading works, and only one particular button quietly stops doing
 * anything. So the start would rather fail loudly.
 */
async function start() {
    // The login cookie is the user record, encrypted. Without a real key it
    // is encrypted with one that is printed in the source, which means anyone
    // can write themselves an admin cookie. Refuse rather than pretend.
    if (process.env.NODE_ENV === 'production' && !config.sessionSecret) {
        console.error('\nSECRET1 is not set.\n' +
            '   The login cookie would be encrypted with a key that is public.\n' +
            '   Generate one and put it in the environment:\n\n' +
            '       openssl rand -hex 32\n')
        process.exit(1)
    }

    if (String(config.driver || 'mongo').toLowerCase() !== 'mongo') {
        try {
            await require('./db/knex').assertMigrated()
        } catch (err) {
            if (err.code === 'MIGRATIONS_PENDING') {
                console.error('\n' + err.message + '\n')
                process.exit(1)
            }
            console.error('\nDatabase unreachable:', err.message, '\n')
            process.exit(1)
        }
    }
    http.listen(port, () => {
        logger.info('Server is running on port: ' + port + ' (database: ' + (config.driver || 'mongo') + ')')
    })
}

start()
