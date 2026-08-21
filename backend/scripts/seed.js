/**
 * Creates demo boards so the app is usable out of an empty database.
 *   node scripts/seed.js          -> only if the board collection is empty
 *   node scripts/seed.js --force  -> drops the existing boards and starts over
 *
 * The shape follows getEmptyBoard()/getEmptyGroup()/getEmptyTask() from
 * frontend/src/services/board.service.js.
 */
const boardRepo = require('../api/board/board.repo')

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const makeId = (len = 6) =>
    Array.from({length: len}, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')

const LABELS = [
    {id: 'l101', title: 'Done', color: '#00c875'},
    {id: 'l102', title: 'Progress', color: '#fdab3d'},
    {id: 'l103', title: 'Stuck', color: '#e2445c'},
    {id: 'l104', title: 'Low', color: '#ffcb00'},
    {id: 'l105', title: 'Medium', color: '#a25ddc'},
    {id: 'l106', title: 'High', color: '#e2445c'},
    {id: 'l107', title: '', color: '#c4c4c4'}
]

const MEMBERS = [
    {_id: 'm101', fullname: 'Alex Neumann', imgUrl: ''},
    {_id: 'm102', fullname: 'Jana Wolf', imgUrl: ''},
    {_id: 'm103', fullname: 'Tim Berger', imgUrl: ''}
]


function task(title, status, priority, memberIds = [], dueDate = ''){
    return {
        id: makeId(),
        title,
        status,
        priority,
        memberIds,
        dueDate,
        comments: [],
        updatedBy: {imgUrl: ''},
        file: ''
    }
}

function group(title, color, tasks){
    return {id: makeId(), title, archivedAt: Date.now(), color, tasks}
}

function board(title, isStarred, groups, folder = ''){
    return {
        title,
        folder,
        archivedAt: Date.now(),
        isStarred,
        createdBy: {fullname: 'Alex', imgUrl: '', _id: makeId()},
        labels: LABELS,
        members: MEMBERS,
        groups,
        activities: [],
        description: ''
    }
}

const BOARDS = [
    board('Website Relaunch', true, [
        group('Konzept', '#0086c0', [
            task('Zielgruppen definieren', 'Done', 'High', ['m101'], '2026-08-20'),
            task('Wettbewerbsanalyse', 'Progress', 'Medium', ['m102'], '2026-08-25'),
            task('Sitemap abstimmen', 'Stuck', 'Medium', ['m101', 'm103'], '2026-08-28')
        ]),
        group('Umsetzung', '#a25ddc', [
            task('Design-System aufsetzen', 'Progress', 'High', ['m103'], '2026-09-05'),
            task('Startseite bauen', '', 'Low', ['m102'], '2026-09-12'),
            task('Kontaktformular', '', 'Low', [], '')
        ]),
        group('Go-Live', '#00c875', [
            task('Redirects pruefen', '', 'High', ['m101'], '2026-09-20'),
            task('Monitoring einrichten', '', 'Medium', [], '')
        ])
    ], 'Marketing'),
    board('Infrastruktur', false, [
        group('Offen', '#e2445c', [
            task('Backup-Strategie dokumentieren', 'Progress', 'High', ['m101'], '2026-08-22'),
            task('Zugriffsrechte pruefen', 'Stuck', 'High', ['m101'], '2026-08-18')
        ]),
        group('Erledigt', '#00c875', [
            task('Vite-Migration', 'Done', 'Medium', ['m101'], '2026-08-14')
        ])
    ], 'IT')
]

async function main(){
    const force = process.argv.includes('--force')

    // Read as an admin so that all boards really are counted.
    const existing = await boardRepo.findForUser({_id: 'seed', isAdmin: true}, {})

    if(existing.length > 0 && !force){
        console.log(`Abbruch: ${existing.length} Board(s) vorhanden. Mit --force ueberschreiben.`)
        return
    }
    if(force && existing.length > 0){
        for(const b of existing) await boardRepo.deleteById(String(b._id))
        console.log(`${existing.length} bestehende Board(s) geloescht.`)
    }

    for(const b of BOARDS){
        const saved = await boardRepo.insert(structuredClone(b))
        const tasks = b.groups.reduce((n, g) => n + g.tasks.length, 0)
        console.log(`  - ${b.title}  (${b.groups.length} Gruppen, ${tasks} Tasks)  _id=${saved._id}`)
    }
    console.log(`${BOARDS.length} Board(s) angelegt.`)
}

async function closeAll(){
    try {
        await require('../db/knex').destroy()
    } catch(err) { /* kein MariaDB im Spiel */
    }
}

main().then(async() => {
    await closeAll();
    process.exit(0)
}).catch(async err => {
    console.error('Seed fehlgeschlagen:', err);
    await closeAll();
    process.exit(1)
})
