/**
 * The global search: the two pure parts, and the shape of the answer.
 *
 * The permission rule cannot be tested here — it lives in the SQL, and this
 * machine has no database. What CAN be tested, and matters just as much, is
 * the step that keeps HTML out of the matching: an update is stored as markup,
 * so the database's LIKE says yes to a search for "p" on every paragraph. A
 * result list full of things that do not contain what was typed reads as a
 * broken search.
 */
const test = require('node:test')
const assert = require('node:assert')

const alsPath = require.resolve('../services/als.service')
const repoPath = require.resolve('../api/search/search.repo')

let currentUser = {_id: 'u1', fullname: 'Alex'}

require.cache[alsPath] = {
    id: alsPath, filename: alsPath, loaded: true,
    exports: {getStore: () => ({loggedinUser: currentUser})}
}

const UPDATES = [
    {id: 'c1', txt: '<p>Das <strong>Angebot</strong> liegt bei</p>', taskId: 't1', taskTitle: 'Task',
        groupId: 'g1', boardId: 'b1', boardTitle: 'Board', byName: 'Alex', at: 1},
    // Matches "p" only because of the markup — must not survive.
    {id: 'c2', txt: '<p>nichts davon</p>', taskId: 't1', taskTitle: 'Task',
        groupId: 'g1', boardId: 'b1', boardTitle: 'Board', byName: 'Alex', at: 2},
    // Matches "span" only through a mention node.
    {id: 'c3', txt: '<p>hallo <span data-type="mention" data-id="u2">@Bob</span></p>',
        taskId: 't1', taskTitle: 'Task', groupId: 'g1', boardId: 'b1', boardTitle: 'Board',
        byName: 'Alex', at: 3}
]

require.cache[repoPath] = {
    id: repoPath, filename: repoPath, loaded: true,
    exports: {
        PER_TYPE: 8,
        boards: async () => [{_id: 'b1', title: 'Board'}],
        tasks: async () => [{id: 't1', title: 'Angebot schreiben'}],
        updates: async (user, term) => UPDATES.filter(u => u.txt.toLowerCase().includes(term.toLowerCase())),
        files: async () => [],
        people: async () => []
    }
}

const searchService = require('../api/search/search.service')

/* ---------------------------------------------------------------- plain -- */

test('the markup is gone before anything is compared', () => {
    assert.strictEqual(
        searchService.toPlain('<p>Das <strong>Angebot</strong> liegt bei</p><p>Gruß</p>'),
        'Das Angebot liegt bei Gruß')
})

test('a line break becomes a space, not nothing', () => {
    // "eins<br>zwei" as "einszwei" would match searches that are not in the
    // text and miss the two words that are.
    assert.strictEqual(searchService.toPlain('<p>eins<br>zwei</p>'), 'eins zwei')
})

test('entities come back as characters', () => {
    assert.strictEqual(searchService.toPlain('<p>Meier &amp; S&#39;ohn</p>'), "Meier & S'ohn")
})

/* -------------------------------------------------------------- excerpt -- */

test('the excerpt is taken around the hit, not from the start', () => {
    const text = 'a'.repeat(200) + ' Angebot ' + 'b'.repeat(200)
    const out = searchService.excerpt(text, 'Angebot')
    assert.ok(out.includes('Angebot'), 'the word that was searched for is in it')
    assert.ok(out.startsWith('…'), 'and it says that something comes before')
})

test('short text is shown whole, without dots', () => {
    assert.strictEqual(searchService.excerpt('kurz und Angebot', 'Angebot'), 'kurz und Angebot')
})

/* --------------------------------------------------------------- search -- */

test('a hit that is only in the markup is thrown away', async () => {
    // Every one of the three updates contains "p" — in a tag. None of them
    // contains it as text.
    const out = await searchService.search('p')
    assert.deepStrictEqual(out.updates.map(u => u.id), [])
})

test('"span" does not find a mention', async () => {
    const out = await searchService.search('span')
    assert.deepStrictEqual(out.updates.map(u => u.id), [])
})

test('a real hit survives and brings a readable preview', async () => {
    const out = await searchService.search('Angebot')
    assert.deepStrictEqual(out.updates.map(u => u.id), ['c1'])
    assert.strictEqual(out.updates[0].preview, 'Das Angebot liegt bei')
    assert.ok(!('txt' in out.updates[0]), 'the raw markup does not leave this layer')
})

test('a term of one character searches nothing at all', async () => {
    const out = await searchService.search('a')
    assert.deepStrictEqual(out, {term: 'a', boards: [], tasks: [], updates: [], files: [], people: []})
})

test('one kind can be asked for on its own', async () => {
    const out = await searchService.search('Angebot', {type: 'tasks'})
    assert.strictEqual(out.tasks.length, 1)
    assert.deepStrictEqual(out.boards, [], 'and the others stay empty rather than absent')
})

test('an unknown area is refused', async () => {
    await assert.rejects(() => searchService.search('Angebot', {type: 'passwoerter'}),
        err => err.status === 400)
})

test('nobody logged in, nothing searched', async () => {
    currentUser = null
    await assert.rejects(() => searchService.search('Angebot'), err => err.status === 401)
    currentUser = {_id: 'u1', fullname: 'Alex'}
})
