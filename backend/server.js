const express = require('express')
const cors = require('cors')
const path = require('path')
const cookieParser = require('cookie-parser')

const app = express()
const http = require('http').createServer(app)

const config = require('./config')

// Express app config
if(config.trustProxy) app.set('trust proxy', true)
app.use(cookieParser())
// The 100kb default is enough for neither large board documents nor profile
// pictures.
app.use(express.json({limit: '2mb'}))

/**
 * In production the server hands out the built frontend.
 *
 * The path used to be `backend/public`, which held a stale react-scripts build
 * committed to the repository. Build output belongs to whoever builds it, so
 * the server now reads where Vite writes — one folder, one owner, and nothing
 * to keep in sync after a build.
 */
const FRONTEND_BUILD = path.resolve(__dirname, '..', 'frontend', 'build')

if(process.env.NODE_ENV === 'production'){
    app.use(express.static(FRONTEND_BUILD))
}

// The allowed origins live in config, because the socket needs the very same
// list. Keeping two lists is how the socket ended up accepting every origin
// while the API accepted three.
if(config.allowedOrigins.length){
    app.use(cors({origin: config.allowedOrigins, credentials: true}))
}

const authRoutes = require('./api/auth/auth.routes')
const userRoutes = require('./api/user/user.routes')
const boardRoutes = require('./api/board/board.routes')
const uploadRoutes = require('./api/upload/upload.routes')
const scheduleRoutes = require('./api/schedule/schedule.routes')
const notificationRoutes = require('./api/notification/notification.routes')
const automationRoutes = require('./api/automation/automation.routes')
const searchRoutes = require('./api/search/search.routes')
const timeRoutes = require('./api/time/time.routes')
const {setupSocketAPI} = require('./services/socket.service')

// routes
const logger = require('./services/logger.service')
const setupAsyncLocalStorage = require('./middlewares/setupAls.middleware')
app.all('/*splat', setupAsyncLocalStorage)

app.use('/api/auth', authRoutes)
app.use('/api/user', userRoutes)
app.use('/api/board', boardRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/schedule', scheduleRoutes)
app.use('/api/notification', notificationRoutes)
app.use('/api/automation', automationRoutes)
app.use('/api/search', searchRoutes)
app.use('/api/time', timeRoutes)
setupSocketAPI(http)

/**
 * Anything under /api that no route claimed is a mistake, and says so.
 *
 * Without this it fell through to the catch-all below and answered the single
 * page application: HTTP 200, Content-Type text/html, for a mistyped endpoint.
 * A client checking `res.ok` sees success and then fails somewhere else
 * entirely, on markup it tried to read as JSON.
 */
app.use('/api', (req, res) => {
    logger.warn(`Unknown endpoint: ${req.method} ${req.originalUrl}`)
    res.status(404).json({err: 'Unknown endpoint'})
})

app.get('/*splat', (req, res) => {
    res.sendFile(path.join(FRONTEND_BUILD, 'index.html'))
})

const port = process.env.PORT || 3030

/**
 * Check first, listen second.
 *
 * A server that comes up on half a schema is very hard to debug later:
 * reading works, and only one particular button quietly stops doing
 * anything. So the start would rather fail loudly.
 */
async function start(){
    // The login cookie is the user record, encrypted. Without a real key it
    // is encrypted with one that is printed in the source, which means anyone
    // can write themselves an admin cookie. Refuse rather than pretend.
    // The check for SECRET1 was here. It guarded a key that signed the login
    // cookie — and a key that can sign a cookie can sign an admin's. Sessions
    // are rows now (services/session.repo.js); there is no key left to leak,
    // so there is nothing to refuse to start without.

    try {
        await require('./db/knex').assertMigrated()
    } catch(err) {
        if(err.code === 'MIGRATIONS_PENDING'){
            console.error('\n' + err.message + '\n')
            process.exit(1)
        }
        console.error('\nDatabase unreachable:', err.message, '\n')
        process.exit(1)
    }
    http.listen(port, () => {
        logger.info('Server is running on port: ' + port)
    })
}

start()
