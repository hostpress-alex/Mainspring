const express = require('express')
const cors = require('cors')
const path = require('path')
const cookieParser = require('cookie-parser')

const app = express()
const http = require('http').createServer(app)

// Express App Config
app.use(cookieParser())
// 100kb Default reicht weder fuer grosse Board-Dokumente noch fuer Profilbilder.
app.use(express.json({ limit: '2mb' }))

if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'public')))
} else {
    const corsOptions = {
        origin: ['http://127.0.0.1:3000', 'http://localhost:3000', 'http://project.buff:3000'],
        credentials: true
    }
    app.use(cors(corsOptions))
}

const authRoutes = require('./api/auth/auth.routes')
const userRoutes = require('./api/user/user.routes')
const boardRoutes = require('./api/board/board.routes')
const uploadRoutes = require('./api/upload/upload.routes')
const scheduleRoutes = require('./api/schedule/schedule.routes')
const {setupSocketAPI} = require('./services/socket.service')

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
const config = require('./config')
const port = process.env.PORT || 3030

/**
 * Erst pruefen, dann horchen.
 *
 * Faehrt der Server mit einem halben Schema hoch, ist der Fehler spaeter kaum
 * zu finden: Lesen funktioniert, und nur ein bestimmter Knopf tut nichts mehr.
 * Deshalb bricht der Start lieber laut ab.
 */
async function start() {
    if (String(config.driver || 'mongo').toLowerCase() !== 'mongo') {
        try {
            await require('./db/knex').assertMigrated()
        } catch (err) {
            if (err.code === 'MIGRATIONS_PENDING') {
                console.error('\n' + err.message + '\n')
                process.exit(1)
            }
            console.error('\nDatenbank nicht erreichbar:', err.message, '\n')
            process.exit(1)
        }
    }
    http.listen(port, () => {
        logger.info('Server is running on port: ' + port + ' (Datenbank: ' + (config.driver || 'mongo') + ')')
    })
}

start()