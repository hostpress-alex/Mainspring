/**
 * Testreihe gegen eine echte MariaDB.
 *
 * ACHTUNG: leert am Anfang JEDE Tabelle der konfigurierten Datenbank.
 *
 * Deshalb laeuft das Skript nur, wenn der Datenbankname auf _test endet —
 * oder wenn man ausdruecklich ICH_WEISS_WAS_ICH_TUE=ja setzt. Ohne diese
 * Bremse loescht ein Fehlgriff im falschen Ordner den echten Bestand.
 *
 * Einmalig eine Testdatenbank anlegen:
 *   CREATE DATABASE projectmanager_test
 *     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
 *   GRANT ALL ON projectmanager_test.* TO 'projectmanager'@'localhost';
 *
 * Dann:
 *   MYSQL_DB=projectmanager_test npm run db:migrate
 *   MYSQL_DB=projectmanager_test node test-mariadb.js
 */
const als = require('./services/als.service')
const { db, destroy } = require('./db/knex')
const boardService = require('./api/board/board.service')
const userService = require('./api/user/user.service')
const userRepo = require('./api/user/user.repo')
const scheduleService = require('./api/schedule/schedule.service')

let pass = 0, fail = 0
const ok = (c, n, x = '') => { if (c) { pass++; console.log('  ok   ' + n) } else { fail++; console.log('  FAIL ' + n + (x ? '  -> ' + x : '')) } }
const head = t => console.log('\n' + t)

// Der Server legt den angemeldeten Benutzer per AsyncLocalStorage ab. Fuer
// den Test genuegt es, getStore zu ersetzen.
let current = null
als.getStore = () => ({ loggedinUser: current })
const as = u => { current = u }

/** Sicherung gegen den Lauf auf der echten Datenbank. */
function assertTestDatabase() {
    const name = String(require('./config').mysql.database || '')
    if (/_test$/i.test(name)) return
    if (process.env.ICH_WEISS_WAS_ICH_TUE === 'ja') {
        console.log(`WARNUNG: leere gleich die Datenbank "${name}" — auf eigene Verantwortung.\n`)
        return
    }
    console.error(`\nAbbruch: Dieses Skript leert alle Tabellen, und "${name}" sieht nicht nach`)
    console.error('einer Testdatenbank aus (der Name muesste auf _test enden).\n')
    console.error('  Gewollt:  MYSQL_DB=projectmanager_test node test-mariadb.js')
    console.error('  Notfalls: ICH_WEISS_WAS_ICH_TUE=ja node test-mariadb.js\n')
    process.exit(1)
}

async function reset() {
    const k = db()
    await k.raw('SET FOREIGN_KEY_CHECKS = 0')
    for (const t of ['file', 'schedule', 'activity', 'task_comment', 'task_member', 'task', 'board_group', 'board_column', 'board_member', 'board', 'user']) {
        await k(t).del()
    }
    await k.raw('SET FOREIGN_KEY_CHECKS = 1')
}

function emptyBoard(title) {
    return {
        title,
        description: 'Beschreibung',
        folder: 'IT',
        isStarred: false,
        archivedAt: 1700000000000,
        labels: [{ id: 'l101', title: 'Done', color: '#00c875' }],
        members: [],
        groups: [],
        activities: [],
        columns: [
            { id: 'c_status01', type: 'status', title: 'Status', field: 'status' },
            { id: 'c_person01', type: 'person', title: 'Person', field: 'memberIds' },
            { id: 'c_text0001', type: 'text', title: 'Notiz', field: 'c_text0001', maxLen: 200 },
        ],
        cmpsOrder: ['status-picker'],
        cmpsOption: ['status-picker', 'member-picker'],
    }
}

async function main() {
    assertTestDatabase()
    await reset()

    head('Benutzer')
    as({ _id: 'seed', isAdmin: true })
    const alex = await userService.create({ username: 'alex', password: 'geheim1234', fullname: 'Alex', isAdmin: true })
    const jana = await userService.create({ username: 'jana', password: 'geheim1234', fullname: 'Jana' })
    ok(/^[a-f0-9]{24}$/.test(alex._id), 'Benutzer-Id sieht aus wie frueher', alex._id)
    ok(alex.password === undefined, 'Passwort verlaesst den Service nicht')
    const found = await userService.getByUsername('alex')
    ok(!!found && found.password && found.password.startsWith('$2'), 'Passwort ist gehasht abgelegt')
    ok((await userService.query({ txt: 'jan' })).length === 1, 'Suche nach Benutzern')
    let conflict = 0
    try { await userService.create({ username: 'alex', password: 'geheim1234', fullname: 'X' }) } catch (e) { conflict = e.status }
    ok(conflict === 409, 'doppelter Benutzername -> 409', String(conflict))

    const ALEX = { ...alex }
    const JANA = { ...jana }
    const FREMD = { _id: 'ffffffffffffffffffffffff', fullname: 'Fremd' }

    head('Board anlegen und lesen')
    as(ALEX)
    const created = await boardService.add(emptyBoard('Mein Board'))
    const BID = String(created._id)
    ok(/^[a-f0-9]{24}$/.test(BID), 'Board-Id ist 24 Hexzeichen', BID)

    let board = await boardService.getById(BID)
    ok(board.title === 'Mein Board', 'Titel gelesen')
    ok(board.description === 'Beschreibung' && board.folder === 'IT', 'Kopfdaten gelesen')
    ok(board.archivedAt === 1700000000000, 'Zeitstempel als Zahl', String(board.archivedAt))
    ok(board.labels.length === 1 && board.labels[0].color === '#00c875', 'Labels als JSON gelesen')
    ok(board.columns.length === 3 && board.columns[2].maxLen === 200, 'Spalten inkl. Zusatzfeldern', JSON.stringify(board.columns[2]))
    ok(board.ownerIds.join() === String(ALEX._id), 'Ersteller ist Owner')
    ok(board.members.length === 1 && board.members[0].fullname === 'Alex', 'Ersteller ist Mitglied')
    ok(Array.isArray(board.groups) && board.groups.length === 0, 'noch keine Gruppen')

    head('Mitglieder und Owner')
    await boardService.setMembers(BID, [
        { _id: ALEX._id, fullname: 'Alex', imgUrl: '' },
        { _id: JANA._id, fullname: 'Jana', imgUrl: '' },
    ])
    board = await boardService.getById(BID)
    ok(board.members.length === 2, 'zweites Mitglied da')
    ok(board.ownerIds.join() === String(ALEX._id), 'Owner blieb beim Wechsel der Mitglieder erhalten', board.ownerIds.join())

    let status = 0
    try { await boardService.setOwners(BID, []) } catch (e) { status = e.status }
    ok(status === 400, 'Board braucht einen Owner -> 400', String(status))
    status = 0
    try { await boardService.setOwners(BID, [String(FREMD._id)]) } catch (e) { status = e.status }
    ok(status === 400, 'Owner muss Mitglied sein -> 400', String(status))
    await boardService.setOwners(BID, [String(ALEX._id), String(JANA._id)])
    board = await boardService.getById(BID)
    ok(board.ownerIds.length === 2, 'zwei Owner moeglich')
    await boardService.setOwners(BID, [String(ALEX._id)])

    as(JANA)
    status = 0
    try { await boardService.setMembers(BID, []) } catch (e) { status = e.status }
    ok(status === 403, 'Mitglied darf keine Mitglieder aendern -> 403', String(status))
    as(FREMD)
    status = 0
    try { await boardService.getById(BID) } catch (e) { status = e.status }
    ok(status === 403, 'Fremder sieht das Board nicht -> 403', String(status))

    head('Gruppen und Tasks')
    as(ALEX)
    await boardService.addGroup(BID, { id: 'g1', title: 'Gruppe A', color: '#f00', tasks: [] })
    await boardService.addGroup(BID, { id: 'g2', title: 'Gruppe B', color: '#0f0', tasks: [] })
    await boardService.addTask(BID, 'g1', { id: 't1', title: 'Eins', status: '', priority: '', memberIds: [], comments: [] })
    await boardService.addTask(BID, 'g1', { id: 't2', title: 'Zwei', status: '', priority: '', memberIds: [], comments: [] })
    await boardService.addTask(BID, 'g1', { id: 't3', title: 'Drei', status: '', priority: '', memberIds: [], comments: [] })
    await boardService.addTask(BID, 'g2', { id: 't4', title: 'Vier', status: '', priority: '', memberIds: [], comments: [] })

    board = await boardService.getById(BID)
    ok(board.groups.map(g => g.id).join() === 'g1,g2', 'Gruppen in Reihenfolge', board.groups.map(g => g.id).join())
    ok(board.groups[0].tasks.map(t => t.id).join() === 't1,t2,t3', 'Tasks in Reihenfolge', board.groups[0].tasks.map(t => t.id).join())

    await boardService.addTask(BID, 'g1', { id: 't9', title: 'Neun' }, 1)
    board = await boardService.getById(BID)
    ok(board.groups[0].tasks.map(t => t.id).join() === 't1,t9,t2,t3', 'an Position 1 eingefuegt', board.groups[0].tasks.map(t => t.id).join())
    await boardService.removeTask(BID, 'g1', 't9')

    head('Felder eines Tasks')
    await boardService.updateTaskFields(BID, 'g1', 't1', {
        status: 'l101', c_text0001: 'Notizinhalt', memberIds: [String(JANA._id)],
        updatedBy: { imgUrl: '/api/upload/' + 'a'.repeat(32), date: 1712345678000 },
    })
    board = await boardService.getById(BID)
    let t1 = board.groups[0].tasks.find(t => t.id === 't1')
    ok(t1.status === 'l101', 'Statuswert gespeichert', t1.status)
    ok(t1.c_text0001 === 'Notizinhalt', 'eigene Spalte gespeichert', t1.c_text0001)
    ok(t1.memberIds.join() === String(JANA._id), 'Zuweisung als eigene Zeile', t1.memberIds.join())
    ok(t1.updatedBy && t1.updatedBy.date === 1712345678000, 'updatedBy erhalten', JSON.stringify(t1.updatedBy))
    ok(board.groups[0].tasks.find(t => t.id === 't2').title === 'Zwei', 'Nachbar-Task unberuehrt')

    // Der Spiegel in echten Spalten, damit man in DBeaver etwas sieht.
    const rawTask = await db()('task').where({ board_id: BID, id: 't1' }).first()
    ok(Number(rawTask.updated_at) === 1712345678000, 'updated_at als echte Spalte', String(rawTask.updated_at))
    const memberRows = await db()('task_member').where({ board_id: BID, task_id: 't1' })
    ok(memberRows.length === 1 && memberRows[0].user_id === String(JANA._id), 'task_member als echte Tabelle')

    head('Kommentare')
    await boardService.updateTaskFields(BID, 'g1', 't1', {
        comments: [
            { id: 'k1', txt: 'Erster', archivedAt: 1700000000001, byMember: { _id: String(ALEX._id), fullname: 'Alex', imgUrl: '' }, attachments: [{ url: '/api/upload/x' }], style: { textAlign: 'Left' } },
            { id: 'k2', txt: 'Zweiter', archivedAt: 1700000000002, byMember: { _id: String(JANA._id), fullname: 'Jana', imgUrl: '' }, attachments: [], style: {} },
        ],
    })
    board = await boardService.getById(BID)
    t1 = board.groups[0].tasks.find(t => t.id === 't1')
    ok(t1.comments.length === 2 && t1.comments[0].id === 'k1', 'Kommentare in Reihenfolge', JSON.stringify(t1.comments.map(c => c.id)))
    ok(t1.comments[0].attachments.length === 1, 'Anhaenge erhalten')
    ok(t1.comments[0].byMember.fullname === 'Alex', 'Verfasser erhalten')
    ok((await db()('task_comment').where({ board_id: BID })).length === 2, 'Kommentare als echte Zeilen')

    head('Reihenfolge und Verschieben')
    await boardService.reorderTasks(BID, 'g1', ['t3', 't2', 't1'])
    board = await boardService.getById(BID)
    ok(board.groups[0].tasks.map(t => t.id).join() === 't3,t2,t1', 'Tasks umsortiert', board.groups[0].tasks.map(t => t.id).join())
    ok(board.groups[0].tasks.find(t => t.id === 't1').comments.length === 2, 'Kommentare haben das Umsortieren ueberlebt')

    await boardService.moveTask(BID, 'g1', 'g2', 't1', 0)
    board = await boardService.getById(BID)
    ok(board.groups[1].tasks.map(t => t.id).join() === 't1,t4', 'in Zielgruppe vorn', board.groups[1].tasks.map(t => t.id).join())
    ok(board.groups[0].tasks.map(t => t.id).join() === 't3,t2', 'aus Quellgruppe raus', board.groups[0].tasks.map(t => t.id).join())
    ok(board.groups[1].tasks[0].comments.length === 2, 'Kommentare beim Verschieben erhalten')
    ok(board.groups[1].tasks[0].memberIds.length === 1, 'Zuweisung beim Verschieben erhalten')

    status = 0
    try { await boardService.reorderTasks(BID, 'g1', ['t3']) } catch (e) { status = e.status }
    ok(status === 400, 'unvollstaendige Reihenfolge -> 400', String(status))

    head('Gruppe ersetzen')
    await boardService.replaceGroup(BID, 'g1', {
        id: 'gefaelscht', title: 'Gruppe A neu', color: '#00f',
        tasks: [{ id: 't2', title: 'Zwei neu', status: 'l102', memberIds: [], comments: [] }],
    })
    board = await boardService.getById(BID)
    ok(board.groups[0].id === 'g1', 'Gruppen-Id bleibt g1', board.groups[0].id)
    ok(board.groups[0].title === 'Gruppe A neu' && board.groups[0].color === '#00f', 'Kopf ersetzt')
    ok(board.groups[0].tasks.map(t => t.id).join() === 't2', 't3 ist weg', board.groups[0].tasks.map(t => t.id).join())
    ok(board.groups[1].tasks.length === 2, 'andere Gruppe unberuehrt')

    await boardService.updateGroupMeta(BID, 'g1', { title: 'Gruppe A' })
    board = await boardService.getById(BID)
    ok(board.groups[0].title === 'Gruppe A' && board.groups[0].tasks.length === 1, 'Gruppen-Meta ohne Task-Verlust')

    await boardService.addGroup(BID, { id: 'g3', title: 'C', tasks: [] }, 0)
    board = await boardService.getById(BID)
    ok(board.groups.map(g => g.id).join() === 'g3,g1,g2', 'Gruppe vorn eingefuegt', board.groups.map(g => g.id).join())
    await boardService.reorderGroups(BID, ['g1', 'g2', 'g3'])
    board = await boardService.getById(BID)
    ok(board.groups.map(g => g.id).join() === 'g1,g2,g3', 'Gruppen umsortiert')
    await boardService.removeGroup(BID, 'g3')
    board = await boardService.getById(BID)
    ok(board.groups.length === 2, 'Gruppe geloescht')

    head('Gleichzeitigkeit (der eigentliche Punkt)')
    // Zwei Transaktionen greifen denselben Task an, in verschiedenen Spalten.
    await Promise.all([
        boardService.updateTaskFields(BID, 'g2', 't1', { status: 'l103' }),
        boardService.updateTaskFields(BID, 'g2', 't1', { priority: 'l106' }),
    ])
    board = await boardService.getById(BID)
    t1 = board.groups[1].tasks.find(t => t.id === 't1')
    ok(t1.status === 'l103', 'Aenderung A ueberlebt', t1.status)
    ok(t1.priority === 'l106', 'Aenderung B ueberlebt auch', t1.priority)

    // Zehn gleichzeitige Schreibvorgaenge auf zehn verschiedene Spalten.
    const keys = Array.from({ length: 10 }, (_, i) => 'feld' + i)
    await Promise.all(keys.map(k => boardService.updateTaskFields(BID, 'g2', 't1', { [k]: k })))
    board = await boardService.getById(BID)
    t1 = board.groups[1].tasks.find(t => t.id === 't1')
    const lost = keys.filter(k => t1[k] !== k)
    ok(lost.length === 0, 'zehn gleichzeitige Aenderungen, keine verloren', 'fehlend: ' + lost.join())

    head('Aktivitaeten')
    for (let i = 0; i < 45; i++) {
        await boardService.addActivity(BID, { action: 'a' + i, createdAt: 1700000000000 + i, byMember: { _id: String(ALEX._id), fullname: 'Alex' }, task: { id: 't1', title: 'Eins' }, from: {}, to: { status: 'l101' } })
    }
    board = await boardService.getById(BID)
    ok(board.activities.length === 40, 'auf 40 begrenzt', String(board.activities.length))
    ok(board.activities[0].action === 'a44', 'neueste zuerst', board.activities[0].action)
    ok(board.activities[0].to.status === 'l101', 'from/to als JSON erhalten')

    head('Aktivitaeten: from/to in jeder Form')
    {
        const faelle = [
            ['title',    'Alter Titel',                    'Neuer Titel'],
            ['person',   'Added',                          '/api/upload/' + 'c'.repeat(32)],
            ['number',   '-',                              42],
            ['status',   { title: 'Progress', color: '#fdab3d' }, { title: 'Done', color: '#00c875' }],
            ['check',    false,                            true],
            ['date',     '',                               1712345678000],
            ['leer',     undefined,                        undefined],
        ]
        const frisch = await boardService.add(emptyBoard('Verlauf'))
        const VID = String(frisch._id)
        for (const [action, from, to] of faelle) {
            await boardService.addActivity(VID, { action, createdAt: Date.now(), byMember: { _id: String(ALEX._id), fullname: 'Alex' }, task: { id: 't1', title: 'X' }, from, to })
        }
        const gelesen = await boardService.getById(VID)
        const byAction = new Map(gelesen.activities.map(a => [a.action, a]))
        ok(byAction.get('title').from === 'Alter Titel', 'Text ueberlebt (frueher: null)', JSON.stringify(byAction.get('title').from))
        ok(byAction.get('title').to === 'Neuer Titel', 'Text im to ebenso', JSON.stringify(byAction.get('title').to))
        ok(byAction.get('person').from === 'Added', 'Person-Text ueberlebt', JSON.stringify(byAction.get('person').from))
        ok(byAction.get('number').to === 42, 'Zahl bleibt Zahl', JSON.stringify(byAction.get('number').to))
        ok(byAction.get('status').to.color === '#00c875', 'Label-Objekt unveraendert', JSON.stringify(byAction.get('status').to))
        ok(byAction.get('check').from === false && byAction.get('check').to === true, 'Wahrheitswerte bleiben Wahrheitswerte', JSON.stringify([byAction.get('check').from, byAction.get('check').to]))
        ok(byAction.get('date').from === '', 'leerer Text bleibt leerer Text', JSON.stringify(byAction.get('date').from))
        ok(byAction.get('leer').from === null && byAction.get('leer').to === null, 'fehlender Wert kommt als null, nicht als {}', JSON.stringify([byAction.get('leer').from, byAction.get('leer').to]))
        // Nichts davon darf ein Objekt ohne Inhalt sein — React wirft daran.
        const leereObjekte = gelesen.activities.filter(a =>
            [a.from, a.to].some(v => v !== null && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length))
        ok(!leereObjekte.length, 'kein leeres Objekt im Verlauf', String(leereObjekte.length))
        await boardService.remove(VID)
    }

    head('Board-Liste und Rechte')
    as(ALEX)
    await boardService.add(emptyBoard('Zweites Board'))
    ok((await boardService.query()).length === 2, 'Alex sieht beide Boards')
    ok((await boardService.query({ title: 'zweit' })).length === 1, 'Suche nach Titel')
    as(JANA)
    ok((await boardService.query()).length === 1, 'Jana sieht nur ihr Board')
    as(FREMD)
    ok((await boardService.query()).length === 0, 'Fremder sieht nichts')
    as({ _id: 'admin000000000000000000a', isAdmin: true })
    ok((await boardService.query()).length === 2, 'Admin sieht alles')

    head('Profilbild wird in der Mitgliederliste aufgefrischt')
    as(JANA)
    await userService.update({ _id: String(JANA._id), imgUrl: '/api/upload/' + 'b'.repeat(32) }, JANA)
    as(ALEX)
    board = await boardService.getById(BID)
    const janaRow = board.members.find(m => String(m._id) === String(JANA._id))
    ok(janaRow.imgUrl === '/api/upload/' + 'b'.repeat(32), 'neues Bild kommt beim Lesen mit', janaRow.imgUrl)

    head('Kalender')
    as(JANA)
    const entry = await scheduleService.add({
        boardId: BID, taskId: 't1',
        start: '2026-08-17T09:00:00.000Z', end: '2026-08-17T11:00:00.000Z', note: 'Vormittag',
    })
    ok(/^[a-f0-9]{24}$/.test(String(entry._id)), 'Kalender-Id sieht aus wie frueher', String(entry._id))
    ok(entry.boardTitle === 'Mein Board' && entry.taskTitle, 'Titel mitgespeichert')
    let list = await scheduleService.query({ from: '2026-08-17T00:00:00.000Z', to: '2026-08-18T00:00:00.000Z' })
    ok(list.length === 1, 'Eintrag im Zeitraum gefunden', String(list.length))
    list = await scheduleService.query({ from: '2026-08-19T00:00:00.000Z', to: '2026-08-20T00:00:00.000Z' })
    ok(list.length === 0, 'ausserhalb des Zeitraums nicht')
    // Ueberlappung: der Eintrag ragt in den Zeitraum hinein.
    list = await scheduleService.query({ from: '2026-08-17T10:00:00.000Z', to: '2026-08-17T10:30:00.000Z' })
    ok(list.length === 1, 'ueberlappender Eintrag kommt mit')
    as(ALEX)
    status = 0
    try { await scheduleService.remove(String(entry._id)) } catch (e) { status = e.status }
    ok(status === 403, 'fremder Kalendereintrag -> 403', String(status))
    as(JANA)
    await scheduleService.update(String(entry._id), { start: '2026-08-17T09:00:00.000Z', end: '2026-08-17T12:00:00.000Z', boardId: BID, taskId: 't1', note: 'laenger' })
    list = await scheduleService.query({})
    ok(list.length === 1 && list[0].note === 'laenger', 'Eintrag geaendert', JSON.stringify(list[0].note))
    await scheduleService.remove(String(entry._id))
    ok((await scheduleService.query({})).length === 0, 'Eintrag geloescht')

    head('Labels pro Spalte und Antworten auf Updates')
    {
        // Spalten-Labels reisen durch board_column.settings.
        board = await boardService.getById(BID)
        const statusCol = board.columns.find(c => c.type === 'status')
        ok(Array.isArray(statusCol.labels), 'Status-Spalte hat eine eigene Label-Liste', JSON.stringify(statusCol.labels?.map(l => l.title)))
        // Die Liste muss genau die Werte enthalten, die in dieser Spalte
        // wirklich vorkommen — plus das leere Label zum Zuruecknehmen.
        const inUse = new Set()
        for (const g of board.groups) for (const t of g.tasks) if (t.status) inUse.add(t.status)
        const titles = statusCol.labels.map(l => l.title)
        ok([...inUse].every(v => titles.includes(v)), 'jeder benutzte Wert ist als Label dabei', titles.join() + ' vs ' + [...inUse].join())
        ok(titles[titles.length - 1] === '', 'leeres Label haengt hinten dran', titles.join())

        const eigene = [
            { id: 'lb_a', title: 'Offen', color: '#fdab3d' },
            { id: 'lb_b', title: 'Erledigt', color: '#00c875' },
            { id: 'lb_c', title: '', color: '#c4c4c4' },
        ]
        await boardService.setColumns(BID, board.columns.map(c => c.id === statusCol.id ? { ...c, labels: eigene } : c))
        board = await boardService.getById(BID)
        const nachher = board.columns.find(c => c.id === statusCol.id)
        ok(nachher.labels.map(l => l.title).join() === 'Offen,Erledigt,', 'eigene Liste kommt zurueck', nachher.labels.map(l => l.title).join())
        ok(nachher.labels[0].color === '#fdab3d', 'Farben erhalten')
        ok(nachher.type === 'status' && nachher.field === 'status', 'Spalte selbst unveraendert')

        // Antworten: Kommentar mit parentId.
        await boardService.updateTaskFields(BID, 'g2', 't1', {
            comments: [
                { id: 'u1', txt: 'Das Update', archivedAt: 1700000000100, byMember: { _id: String(ALEX._id), fullname: 'Alex' }, attachments: [], style: {} },
                { id: 'r1', parentId: 'u1', txt: 'Erste Antwort', archivedAt: 1700000000200, byMember: { _id: String(JANA._id), fullname: 'Jana' }, attachments: [], style: {} },
                { id: 'r2', parentId: 'u1', txt: 'Zweite Antwort', archivedAt: 1700000000300, byMember: { _id: String(ALEX._id), fullname: 'Alex' }, attachments: [], style: {} },
            ],
        })
        board = await boardService.getById(BID)
        const withReplies = board.groups[1].tasks.find(t => t.id === 't1')
        ok(withReplies.comments.length === 3, 'drei Eintraege gespeichert', String(withReplies.comments.length))
        ok(withReplies.comments.find(c => c.id === 'u1').parentId === null, 'Update hat keine parentId')
        const replies = withReplies.comments.filter(c => c.parentId === 'u1')
        ok(replies.length === 2, 'zwei Antworten haengen am Update', String(replies.length))
        ok(replies.map(r => r.txt).join(' | ') === 'Erste Antwort | Zweite Antwort', 'Reihenfolge erhalten', replies.map(r => r.txt).join(' | '))
        const parentRows = await db()('task_comment').where({ board_id: BID, task_id: 't1' }).whereNotNull('parent_id')
        ok(parentRows.length === 2, 'parent_id ist eine echte Spalte in MariaDB', String(parentRows.length))
    }

    head('Upload-Metadaten')
    const fileService = require('./services/file.service')
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100' + '0'.repeat(16), 'hex')
    const up = await fileService.save(png, 'image/png', ALEX, { scope: 'task', taskId: 't1' })
    ok(/^[a-f0-9]{32}$/.test(up._id), 'Datei-Id im gewohnten Format', up._id)
    ok(up.url === '/api/upload/' + up._id, 'Auslieferungspfad unveraendert', up.url)
    const rowFile = await db()('file').where({ id: up._id }).first()
    ok(!!rowFile, 'Metadaten liegen in MariaDB, nicht mehr in MongoDB')
    ok(rowFile.scope === 'task' && rowFile.task_id === 't1', 'Verwendungszweck gespeichert', rowFile.scope + '/' + rowFile.task_id)
    ok(rowFile.uploaded_by_id === String(ALEX._id), 'Hochlader gespeichert')
    const meta = await fileService.getMeta(up._id)
    ok(meta.relPath === rowFile.rel_path && meta.mime === 'image/png', 'getMeta liefert dieselbe Form wie frueher', JSON.stringify(meta.mime))
    await fileService.remove(up._id)
    ok((await db()('file').where({ id: up._id })).length === 0, 'Datei-Eintrag wieder weg')
    let fehlt = 0
    try { await fileService.getMeta('0'.repeat(32)) } catch (e) { fehlt = e.status }
    ok(fehlt === 404, 'unbekannte Datei -> 404', String(fehlt))

    head('Loeschen raeumt auf')
    as(ALEX)
    const doomed = await boardService.add(emptyBoard('Wegwerf'))
    await boardService.addGroup(String(doomed._id), { id: 'gx', title: 'X', tasks: [] })
    await boardService.addTask(String(doomed._id), 'gx', { id: 'tx', title: 'X', comments: [{ id: 'kx', txt: 'hallo' }], memberIds: [String(ALEX._id)] })
    await boardService.remove(String(doomed._id))
    ok((await db()('task').where({ board_id: String(doomed._id) })).length === 0, 'Tasks mitgeloescht')
    ok((await db()('task_comment').where({ board_id: String(doomed._id) })).length === 0, 'Kommentare mitgeloescht')
    ok((await db()('board_member').where({ board_id: String(doomed._id) })).length === 0, 'Mitgliedschaften mitgeloescht')

    head('Kaputte Eingaben')
    status = 0
    try { await boardService.getById('keine-gueltige-id') } catch (e) { status = e.status }
    ok(status === 404, 'kaputte Board-Id -> 404', String(status))
    status = 0
    try { await boardService.updateTaskFields(BID, 'g1', 'gibtsnicht', { title: 'x' }) } catch (e) { status = e.status }
    ok(status === 404, 'unbekannter Task -> 404', String(status))
    status = 0
    try { await boardService.addTask(BID, 'gibtsnicht', { id: 'tz', title: 'x' }) } catch (e) { status = e.status }
    ok(status === 404, 'unbekannte Gruppe -> 404', String(status))
    // Sonderzeichen im Suchtext duerfen nicht als Platzhalter wirken.
    ok((await boardService.query({ title: '%' })).length === 0, 'Prozentzeichen wird nicht als Platzhalter gewertet')

    console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen')
    await destroy()
    process.exit(fail ? 1 : 0)
}

main().catch(async e => { console.error(e); await destroy(); process.exit(1) })
