/**
 * Der laufende Server, echte HTTP-Aufrufe, echte Datenbank.
 * Prueft die ganze Kette: Route -> Controller -> Service -> Repo -> Datenbank.
 *
 * Voraussetzung: der Server laeuft, und es gibt die Benutzer "alex" und
 * "jana" mit dem Passwort "geheim1234". Beide werden von test-mariadb.js
 * angelegt. Legt Testdaten an und raeumt sie am Ende wieder weg.
 *
 *   node test-mariadb-http.js
 */
const BASE = `http://127.0.0.1:${process.env.PORT || 3030}/api`

let pass = 0, fail = 0
const ok = (c, n, x = '') => { if (c) { pass++; console.log('  ok   ' + n) } else { fail++; console.log('  FAIL ' + n + (x ? '  -> ' + x : '')) } }
const head = t => console.log('\n' + t)

function session() {
    let cookie = ''
    return async function call(method, path, body) {
        const res = await fetch(BASE + path, {
            method,
            headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body),
        })
        const set = res.headers.getSetCookie ? res.headers.getSetCookie() : []
        if (set.length) cookie = set.map(c => c.split(';')[0]).join('; ')
        let data = null
        try { data = await res.json() } catch (e) { /* leer */ }
        return { status: res.status, body: data }
    }
}

async function main() {
    const alex = session()
    const jana = session()
    const anon = session()

    head('Anmeldung')
    let r = await anon('GET', '/board')
    ok(r.status === 401, 'ohne Anmeldung kein Zugriff', String(r.status))
    r = await alex('POST', '/auth/login', { username: 'alex', password: 'falsch' })
    ok(r.status >= 400, 'falsches Passwort wird abgelehnt', String(r.status))
    r = await alex('POST', '/auth/login', { username: 'alex', password: 'geheim1234' })
    ok(r.status === 200 && r.body.fullname === 'Alex', 'Anmeldung Alex', JSON.stringify(r.body))
    const alexId = r.body._id
    r = await jana('POST', '/auth/login', { username: 'jana', password: 'geheim1234' })
    ok(r.status === 200, 'Anmeldung Jana')
    const janaId = r.body._id

    head('Board anlegen')
    r = await alex('POST', '/board', {
        title: 'HTTP Board', description: '', folder: 'IT', isStarred: false,
        members: [], groups: [], activities: [], labels: [],
        columns: [{ id: 'c_status01', type: 'status', title: 'Status', field: 'status' }],
        cmpsOrder: [], cmpsOption: [],
    })
    ok(r.status === 200, 'Board angelegt', String(r.status))
    const BID = r.body._id
    ok(/^[a-f0-9]{24}$/.test(String(BID)), 'Id im gewohnten Format', String(BID))

    r = await alex('GET', '/board/' + BID)
    ok(r.status === 200 && r.body.ownerIds.includes(alexId), 'Alex ist Owner')
    r = await jana('GET', '/board/' + BID)
    ok(r.status === 403, 'Jana hat noch keinen Zugriff', String(r.status))

    head('Mitglieder')
    r = await alex('PUT', `/board/${BID}/members`, {
        members: [{ _id: alexId, fullname: 'Alex', imgUrl: '' }, { _id: janaId, fullname: 'Jana', imgUrl: '' }],
    })
    ok(r.status === 200 && r.body.members.length === 2, 'Jana eingeladen', String(r.status))
    r = await jana('GET', '/board/' + BID)
    ok(r.status === 200, 'Jana sieht das Board jetzt')
    r = await jana('PUT', `/board/${BID}/members`, { members: [] })
    ok(r.status === 403, 'Jana darf keine Mitglieder aendern', String(r.status))

    head('Gruppen und Tasks ueber die gezielten Endpunkte')
    r = await alex('POST', `/board/${BID}/group`, { group: { id: 'g1', title: 'Gruppe A', color: '#f00', tasks: [] }, index: null })
    ok(r.status === 200, 'Gruppe angelegt', String(r.status))
    await alex('POST', `/board/${BID}/group`, { group: { id: 'g2', title: 'Gruppe B', color: '#0f0', tasks: [] }, index: null })
    for (const [id, title] of [['t1', 'Eins'], ['t2', 'Zwei'], ['t3', 'Drei']]) {
        await alex('POST', `/board/${BID}/group/g1/task`, { task: { id, title, status: '', memberIds: [], comments: [] }, index: null })
    }
    r = await alex('GET', '/board/' + BID)
    ok(r.body.groups[0].tasks.map(t => t.id).join() === 't1,t2,t3', 'drei Tasks in Reihenfolge', r.body.groups[0].tasks.map(t => t.id).join())

    head('Gleichzeitig am selben Task')
    const [a, b] = await Promise.all([
        alex('PATCH', `/board/${BID}/group/g1/task/t1`, { status: 'l101' }),
        jana('PATCH', `/board/${BID}/group/g1/task/t1`, { priority: 'l106' }),
    ])
    ok(a.status === 200 && b.status === 200, 'beide Anfragen erfolgreich', a.status + '/' + b.status)
    r = await alex('GET', '/board/' + BID)
    let t1 = r.body.groups[0].tasks.find(t => t.id === 't1')
    ok(t1.status === 'l101', 'Alex Status ueberlebt', t1.status)
    ok(t1.priority === 'l106', 'Janas Prioritaet ueberlebt', t1.priority)

    head('Verschieben, Sortieren, Loeschen')
    r = await alex('PUT', `/board/${BID}/group/g1/tasks/order`, { taskIds: ['t3', 't1', 't2'] })
    ok(r.status === 200 && r.body.groups[0].tasks.map(t => t.id).join() === 't3,t1,t2', 'umsortiert', String(r.status))
    r = await alex('POST', `/board/${BID}/task/t1/move`, { fromGroupId: 'g1', toGroupId: 'g2', index: 0 })
    ok(r.status === 200 && r.body.groups[1].tasks[0].id === 't1', 'in andere Gruppe verschoben')
    ok(r.body.groups[1].tasks[0].status === 'l101', 'Werte beim Verschieben erhalten')
    r = await alex('DELETE', `/board/${BID}/group/g1/task/t2`)
    ok(r.status === 200 && !r.body.groups[0].tasks.some(t => t.id === 't2'), 'Task geloescht')

    head('Kommentar anlegen')
    r = await jana('PATCH', `/board/${BID}/group/g2/task/t1`, {
        comments: [{ id: 'k1', txt: 'Ich uebernehme das', archivedAt: Date.now(),
                     byMember: { _id: janaId, fullname: 'Jana', imgUrl: '' }, attachments: [], style: {} }],
    })
    ok(r.status === 200, 'Kommentar gespeichert', String(r.status))
    t1 = r.body.groups[1].tasks.find(t => t.id === 't1')
    ok(t1.comments.length === 1 && t1.comments[0].txt === 'Ich uebernehme das', 'Kommentar kommt zurueck')

    head('Kalender')
    r = await jana('POST', '/schedule', { boardId: BID, taskId: 't1', start: '2026-08-17T09:00:00.000Z', end: '2026-08-17T11:00:00.000Z', note: 'Vormittag' })
    ok(r.status === 200 || r.status === 201, 'Eintrag angelegt', String(r.status) + ' ' + JSON.stringify(r.body).slice(0, 120))
    r = await jana('GET', '/schedule?from=2026-08-17T00:00:00.000Z&to=2026-08-18T00:00:00.000Z')
    ok(r.status === 200 && r.body.length === 1, 'Eintrag im Zeitraum', JSON.stringify(r.body).slice(0, 120))
    r = await alex('GET', '/schedule?from=2026-08-17T00:00:00.000Z&to=2026-08-18T00:00:00.000Z')
    ok(r.status === 200 && r.body.length === 0, 'Alex sieht Janas Planung nicht')

    head('Board-Liste')
    r = await alex('GET', '/board?title=&isStarred=false')
    ok(r.status === 200 && r.body.length === 1, 'Alex sieht ein Board', String(r.body.length))
    r = await alex('PATCH', '/board/' + BID, { title: 'HTTP Board neu', isStarred: true })
    ok(r.status === 200 && r.body.title === 'HTTP Board neu' && r.body.isStarred === true, 'Kopfdaten geaendert')

    head('Fehlerfaelle')
    r = await alex('PATCH', '/board/keine-id/group/g1/task/t1', { title: 'x' })
    ok(r.status === 404, 'kaputte Board-Id -> 404', String(r.status))
    r = await alex('PATCH', `/board/${BID}/group/g1/task/gibtsnicht`, { title: 'x' })
    ok(r.status === 404, 'unbekannter Task -> 404', String(r.status))
    r = await alex('PUT', `/board/${BID}/group/g1/tasks/order`, { taskIds: [] })
    ok(r.status === 400, 'unvollstaendige Reihenfolge -> 400', String(r.status))

    head('Aufraeumen')
    r = await jana('DELETE', '/board/' + BID)
    ok(r.status === 403, 'Jana darf das Board nicht loeschen', String(r.status))
    r = await alex('DELETE', '/board/' + BID)
    ok(r.status === 200, 'Alex loescht das Board', String(r.status))
    r = await jana('GET', '/schedule?from=2026-08-17T00:00:00.000Z&to=2026-08-18T00:00:00.000Z')
    ok(r.body.length === 0, 'Kalendereintrag ist mitgegangen', JSON.stringify(r.body))

    console.log('\n' + pass + ' ok, ' + fail + ' fehlgeschlagen')
    process.exit(fail ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
