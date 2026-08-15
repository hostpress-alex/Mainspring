/**
 * Move existing data from MongoDB to MariaDB.
 *
 * First: create the tables with  npx knex migrate:latest
 *
 * Trial run (writes nothing, only shows what would happen):
 *   node scripts/migrate-to-mariadb.js --dry
 *
 * Really transfer:
 *   node scripts/migrate-to-mariadb.js
 *
 * If MariaDB already holds data the script stops. With --force the target
 * tables are emptied first — that deletes everything in MariaDB.
 *
 * The ids are kept: ObjectId 66f1... becomes the string 66f1... That way
 * existing links and bookmarks keep working.
 */
const { MongoClient } = require('mongodb')

process.env.DB_DRIVER = 'mariadb'
const config = require('../config')
const { db, destroy } = require('../db/knex')
const boardRepoSql = require('../api/board/board.repo.sql')
const userRepoSql = require('../api/user/user.repo.sql')
const scheduleRepoSql = require('../api/schedule/schedule.repo.sql')
const fileRepoSql = require('../services/file.repo.sql')

const DRY = process.argv.includes('--dry')
const FORCE = process.argv.includes('--force')

const sid = v => (v === undefined || v === null) ? '' : String(v)
const isHex24 = v => /^[a-f0-9]{24}$/i.test(sid(v))

const TABLES = ['file', 'schedule', 'activity', 'task_comment', 'task_member', 'task',
                'board_group', 'board_column', 'board_member', 'board', 'user']

/**
 * Derive columns from the old cmpsOrder if a board has none yet.
 * Same mapping as board.service.ensureColumns — written out once here so the
 * columns really land as rows in MariaDB.
 */
const LEGACY_COLUMNS = {
    'status-picker':   { type: 'status',   field: 'status',    title: 'Status' },
    'priority-picker': { type: 'priority', field: 'priority',  title: 'Priority' },
    'member-picker':   { type: 'person',   field: 'memberIds', title: 'Person' },
    'date-picker':     { type: 'date',     field: 'dueDate',   title: 'Date' },
    'number-picker':   { type: 'number',   field: 'number',    title: 'Zahlen' },
    'file-picker':     { type: 'file',     field: 'file',      title: 'Datei' },
    'updated-picker':  { type: 'updated',  field: 'updatedBy', title: 'Zuletzt aktualisiert' },
}
const COL_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
function makeColumnId() {
    let id = 'c_'
    for (let i = 0; i < 8; i++) id += COL_CHARS[Math.floor(Math.random() * COL_CHARS.length)]
    return id
}
function ensureColumns(board) {
    if (Array.isArray(board.columns) && board.columns.length) return board
    const order = Array.isArray(board.cmpsOrder) ? board.cmpsOrder : []
    board.columns = order.map(cmp => {
        const key = String(cmp).replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
        const legacy = LEGACY_COLUMNS[key]
        if (legacy) return { id: makeColumnId(), ...legacy }
        const id = makeColumnId()
        return { id, type: 'text', title: String(cmp), field: id }
    })
    return board
}

function ownerIdsOf(board) {
    if (Array.isArray(board.ownerIds)) return board.ownerIds.map(sid)
    if (board.ownerId) return [sid(board.ownerId)]
    return []
}

async function main() {
    if (!config.dbURL) {
        console.error('MONGO_URL ist nicht gesetzt — von wo soll gelesen werden?')
        process.exit(1)
    }
    console.log('Quelle : ' + config.dbURL + ' / ' + config.dbName)
    console.log('Ziel   : ' + config.mysql.user + '@' + config.mysql.host + ':' + config.mysql.port + '/' + config.mysql.database)
    console.log(DRY ? 'Modus  : Probelauf, es wird nichts geschrieben\n' : 'Modus  : echte Uebertragung\n')

    const k = db()

    // Are the tables really there?
    for (const table of TABLES) {
        if (!(await k.schema.hasTable(table))) {
            console.error(`Tabelle "${table}" fehlt. Erst "npx knex migrate:latest" ausfuehren.`)
            process.exit(1)
        }
    }

    const existing = {}
    for (const table of TABLES) {
        const row = await k(table).count({ n: '*' }).first()
        existing[table] = Number(row.n)
    }
    const filled = Object.entries(existing).filter(([, n]) => n > 0)
    if (filled.length && !DRY) {
        if (!FORCE) {
            console.error('In MariaDB stehen bereits Daten:')
            filled.forEach(([t, n]) => console.error(`  ${t}: ${n} Zeilen`))
            console.error('\nAbgebrochen. Mit --force werden diese Tabellen vorher geleert.')
            process.exit(1)
        }
        console.log('--force: Zieltabellen werden geleert.')
        await k.raw('SET FOREIGN_KEY_CHECKS = 0')
        for (const table of TABLES) await k(table).del()
        await k.raw('SET FOREIGN_KEY_CHECKS = 1')
    }

    const client = await MongoClient.connect(config.dbURL, { serverSelectionTimeoutMS: 8000 })
    const mongo = client.db(config.dbName)

    const report = { users: 0, boards: 0, groups: 0, tasks: 0, comments: 0, activities: 0, schedule: 0, files: 0 }
    const problems = []

    // ------------------------------------------------------------ Benutzer
    const users = await mongo.collection('user').find({}).toArray()
    for (const u of users) {
        const id = sid(u._id)
        if (!isHex24(id)) { problems.push(`Benutzer ${id}: Id passt nicht ins Schema, uebersprungen`); continue }
        if (!u.username) { problems.push(`Benutzer ${id}: ohne Benutzername, uebersprungen`); continue }
        report.users++
        if (DRY) continue
        await userRepoSql.insert({
            _id: id,
            username: u.username,
            password: u.password || '',
            fullname: u.fullname || u.username,
            imgUrl: u.imgUrl || '',
            isAdmin: u.isAdmin === true,
        })
    }
    console.log(`Benutzer: ${report.users}`)

    // -------------------------------------------------------------- Boards
    const boards = await mongo.collection('board').find({}).toArray()
    for (const b of boards) {
        const id = sid(b._id)
        if (!isHex24(id)) { problems.push(`Board ${id}: Id passt nicht ins Schema, uebersprungen`); continue }

        const board = { ...b, _id: id }
        ensureColumns(board)
        board.ownerIds = ownerIdsOf(board)
        delete board.ownerId
        board.members = (board.members || []).filter(Boolean).map(m => ({
            _id: sid(m._id), fullname: m.fullname || '', imgUrl: m.imgUrl || '',
        }))
        // Owners must be members — otherwise the owner flag falls away.
        const memberIds = board.members.map(m => m._id)
        const orphans = board.ownerIds.filter(o => !memberIds.includes(o))
        if (orphans.length) {
            problems.push(`Board ${id} ("${board.title}"): Owner ${orphans.join(', ')} war kein Mitglied — als Mitglied ergaenzt`)
            for (const o of orphans) board.members.push({ _id: o, fullname: '', imgUrl: '' })
        }
        if (!board.ownerIds.length) {
            problems.push(`Board ${id} ("${board.title}"): hat keinen Owner — bitte im Adminbereich einen setzen`)
        }

        board.groups = (board.groups || []).filter(Boolean).map(g => ({
            ...g,
            tasks: (g.tasks || []).filter(Boolean).map(t => ({
                ...t,
                memberIds: (t.memberIds || []).map(sid),
                comments: (t.comments || []).filter(Boolean),
            })),
        }))
        report.groups += board.groups.length
        for (const g of board.groups) {
            report.tasks += g.tasks.length
            for (const t of g.tasks) report.comments += (t.comments || []).length
        }
        report.activities += Math.min((board.activities || []).length, boardRepoSql.MAX_ACTIVITIES)
        report.boards++
        if (DRY) continue
        await boardRepoSql.insert(board)
    }
    console.log(`Boards: ${report.boards}  Gruppen: ${report.groups}  Tasks: ${report.tasks}  Kommentare: ${report.comments}  Aktivitaeten: ${report.activities}`)

    // ------------------------------------------------------------- Kalender
    const boardIds = new Set(boards.map(b => sid(b._id)))
    const entries = await mongo.collection('schedule').find({}).toArray()
    for (const e of entries) {
        const id = sid(e._id)
        if (!boardIds.has(sid(e.boardId))) {
            problems.push(`Kalendereintrag ${id}: Board ${sid(e.boardId)} existiert nicht mehr, uebersprungen`)
            continue
        }
        report.schedule++
        if (DRY) continue
        await scheduleRepoSql.insert({ ...e, _id: id })
    }
    console.log(`Kalendereintraege: ${report.schedule}`)

    // ------------------------------------------------- File metadata
    // The files themselves sit on disk and stay where they are.
    // Only the reference to them moves along.
    const files = await mongo.collection('file').find({}).toArray()
    for (const f of files) {
        const id = sid(f._id)
        if (!/^[a-f0-9]{32}$/.test(id)) { problems.push(`Datei ${id}: Id passt nicht ins Schema, uebersprungen`); continue }
        if (!f.relPath) { problems.push(`Datei ${id}: ohne Pfad, uebersprungen`); continue }
        report.files++
        if (DRY) continue
        await fileRepoSql.insert({ ...f, _id: id })
    }
    console.log(`Datei-Metadaten: ${report.files}`)

    if (problems.length) {
        console.log('\nHinweise:')
        problems.forEach(p => console.log('  - ' + p))
    }

    if (!DRY) {
        console.log('\nGegenprobe:')
        for (const table of TABLES) {
            const row = await k(table).count({ n: '*' }).first()
            console.log(`  ${table.padEnd(14)} ${row.n}`)
        }
        console.log('\nFertig. Jetzt starten mit:  DB_DRIVER=mariadb npm start')
    } else {
        console.log('\nProbelauf beendet — es wurde nichts geschrieben.')
    }

    await client.close()
    await destroy()
}

main().catch(async err => {
    console.error('\nAbgebrochen:', err.message)
    console.error(err)
    await destroy().catch(() => {})
    process.exit(1)
})
