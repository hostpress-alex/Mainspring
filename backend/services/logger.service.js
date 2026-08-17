const fs = require('fs')
const asyncLocalStorage = require('./als.service')

const logsDir = './logs'
const logFile = `${logsDir}/backend.log`
const oldFile = `${logsDir}/backend.log.1`

if(!fs.existsSync(logsDir)){
    fs.mkdirSync(logsDir)
}

/**
 * How large the log may get before it is rolled over.
 *
 * It grew without any bound at all: append, append, append, until somebody
 * noticed the disk. Five megabytes is a few days of a busy board and small
 * enough to open in an editor when something has gone wrong.
 */
const MAX_BYTES = 5 * 1024 * 1024

/**
 * Roll the file over: the current one becomes backend.log.1, and the previous
 * backend.log.1 is gone.
 *
 * Exactly one generation is kept, on purpose. A ring of ten files is a thing
 * to write, test and reason about; two files answer the only question anybody
 * asks of this log — "what happened just before it broke" — and the size is
 * bounded at ten megabytes whatever happens.
 *
 * The size is COUNTED, not measured. Writing is asynchronous, so a `stat`
 * reports what has landed rather than what has been handed over — under a
 * burst it reads far too small, and the roll never happens. The count is what
 * this process has written, seeded once from the file it found.
 *
 * The rename itself is synchronous. It runs once per five megabytes, and the
 * alternative is two lines racing to rename the same file.
 */
let written = currentSize()

function currentSize(){
    try {
        return fs.existsSync(logFile)?fs.statSync(logFile).size:0
    } catch(err) {
        return 0
    }
}

function rollIfNeeded(lineLength){
    written += lineLength
    if(written < MAX_BYTES) return
    written = 0

    try {
        if(fs.existsSync(oldFile)) fs.unlinkSync(oldFile)
        if(fs.existsSync(logFile)) fs.renameSync(logFile, oldFile)
    } catch(err) {
        // A log that cannot be rolled must not stop the application. It says
        // so on the console and goes on appending.
        console.log('cannot roll the log file:', err.message)
    }
}

//define the time format
function getTime(){
    let now = new Date()
    return now.toLocaleString('he')
}

function isError(e){
    return e && e.stack && e.message
}

function doLog(level, ...args){

    const strs = args.map(arg =>
        (typeof arg === 'string' || isError(arg))?arg:JSON.stringify(arg)
    )

    var line = strs.join(' | ')
    const store = asyncLocalStorage.getStore()
    const userId = store?.loggedinUser?._id
    const str = userId?`(userId: ${userId})`:''
    line = `${getTime()} - ${level} - ${line} ${str}\n`
    console.log(line)
    rollIfNeeded(line.length)
    fs.appendFile(logFile, line, (err) => {
        if(err) console.log('FATAL: cannot write to log file')
    })
}

module.exports = {
    debug(...args){
        // Read NODE_NEV for a long time, so debug logging ran in production too.
        if(process.env.NODE_ENV === 'production') return
        doLog('DEBUG', ...args)
    },
    info(...args){
        doLog('INFO', ...args)
    },
    warn(...args){
        doLog('WARN', ...args)
    },
    error(...args){
        doLog('ERROR', ...args)
    }
}