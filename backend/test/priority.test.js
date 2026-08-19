/**
 * The rules of the global priority list.
 *
 * A closed list is only worth having if it stays closed and stays clean, so
 * what is tested here is the three ways that fails: two entries that mean the
 * same thing, an entry that vanishes while tasks still point at it, and a
 * value on a task that never came from the list at all.
 *
 * The repository is replaced through require.cache, the same way time.test.js
 * does it. Storage is not under test; knex is.
 */
const test = require('node:test')
const assert = require('node:assert')

const repoPath = require.resolve('../api/priority/priority.repo')

let rows = []
let usage = {}
let removed = null
let seq = 0

require.cache[repoPath] = {
    id: repoPath, filename: repoPath, loaded: true,
    exports: {
        async findAll(){ return [...rows].sort((a, b) => a.position - b.position) },
        async findById(id){ return rows.find(r => r.id === id) || null },
        async findByTitle(title, exceptId = null){
            const key = String(title || '').trim().toLowerCase()
            return rows.find(r => r.title.toLowerCase() === key && r.id !== exceptId) || null
        },
        async insert({title, color}){
            const row = {id: 'p' + (++seq), title, color, position: rows.length, createdAt: 1}
            rows.push(row)
            return row
        },
        async update(id, patch){
            const row = rows.find(r => r.id === id)
            Object.assign(row, patch)
            return row
        },
        async reorder(ids){
            ids.forEach((id, i) => {
                const row = rows.find(r => r.id === id)
                if(row) row.position = i
            })
        },
        async usage(){ return usage },
        async removeWithReassign(id, toId){
            removed = {id, toId}
            rows = rows.filter(r => r.id !== id)
            return usage[id] || 0
        }
    }
}

const service = require('../api/priority/priority.service')

test.beforeEach(() => {
    seq = 0
    rows = [
        {id: 'p_low', title: 'Low', color: '#ffcb00', position: 0},
        {id: 'p_high', title: 'High', color: '#e2445c', position: 1}
    ]
    usage = {}
    removed = null
})

const rejects = (fn, status) => assert.rejects(fn, err => err.status === status)

/* -------------------------------------------------------------- adding -- */

test('a new priority is added at the end', async () => {
    const made = await service.create({title: 'Critical', color: '#ff0000'})
    assert.strictEqual(made.title, 'Critical')
    assert.strictEqual((await service.list()).length, 3)
})

test('the same name twice is refused', async () => {
    await rejects(() => service.create({title: 'High'}), 409)
})

test('the same name in different case is still the same name', async () => {
    await rejects(() => service.create({title: '  hIgH '}), 409)
})

test('a name of only spaces is not a name', async () => {
    await rejects(() => service.create({title: '   '}), 400)
})

test('surrounding and doubled spaces are cleaned away', async () => {
    const made = await service.create({title: '  very   urgent  '})
    assert.strictEqual(made.title, 'very urgent')
})

test('an over-long name is refused rather than cut', async () => {
    await rejects(() => service.create({title: 'x'.repeat(service.MAX_TITLE + 1)}), 400)
})

test('something that is not a colour is refused', async () => {
    await rejects(() => service.create({title: 'Later', color: 'red'}), 400)
})

test('a priority without a colour gets the neutral grey', async () => {
    const made = await service.create({title: 'Later'})
    assert.strictEqual(made.color, '#c4c4c4')
})

/* ------------------------------------------------------------ renaming -- */

test('renaming leaves the id alone — that is the whole point', async () => {
    const before = (await service.list()).find(p => p.id === 'p_high')
    const after = await service.update('p_high', {title: 'Hoch'})
    assert.strictEqual(after.id, before.id)
    assert.strictEqual(after.title, 'Hoch')
})

test('renaming onto another name is refused', async () => {
    await rejects(() => service.update('p_high', {title: 'Low'}), 409)
})

test('keeping your own name while changing the colour is allowed', async () => {
    const after = await service.update('p_high', {title: 'High', color: '#123456'})
    assert.strictEqual(after.color, '#123456')
})

test('renaming something that is not there says so', async () => {
    await rejects(() => service.update('p_nope', {title: 'X'}), 404)
})

/* ------------------------------------------------------------ deleting -- */

test('an unused priority is deleted without asking', async () => {
    const out = await service.remove('p_high')
    assert.strictEqual(out.moved, 0)
    assert.strictEqual((await service.list()).length, 1)
})

test('a priority in use is not deleted without a destination', async () => {
    usage = {p_high: 23}
    await assert.rejects(() => service.remove('p_high'), err =>
        err.status === 409 && err.code === 'REASSIGN_REQUIRED' && err.usage === 23)
    assert.strictEqual((await service.list()).length, 2)
})

test('moving the tasks onto itself is not a destination', async () => {
    usage = {p_high: 5}
    await rejects(() => service.remove('p_high', 'p_high'), 409)
})

test('a destination that does not exist is refused', async () => {
    usage = {p_high: 5}
    await rejects(() => service.remove('p_high', 'p_ghost'), 400)
})

test('with a destination the tasks are moved and the priority goes', async () => {
    usage = {p_high: 5}
    const out = await service.remove('p_high', 'p_low')
    assert.deepStrictEqual(removed, {id: 'p_high', toId: 'p_low'})
    assert.strictEqual(out.moved, 5)
    assert.strictEqual((await service.list()).length, 1)
})

test('the last priority stays', async () => {
    rows = [{id: 'p_only', title: 'Normal', color: '#c4c4c4', position: 0}]
    await rejects(() => service.remove('p_only'), 409)
})

/* ------------------------------------------------------------- values -- */

test('an id from the list is a value a task may hold', async () => {
    assert.strictEqual(await service.isAllowedValue('p_high'), true)
})

test('emptying a priority is always allowed', async () => {
    for(const empty of ['', null, undefined]){
        assert.strictEqual(await service.isAllowedValue(empty), true)
    }
})

test('a made-up value is not', async () => {
    assert.strictEqual(await service.isAllowedValue('p_ghost'), false)
    assert.strictEqual(await service.isAllowedValue('High'), false)
})

test('a value that is not even text is not', async () => {
    assert.strictEqual(await service.isAllowedValue({}), false)
    assert.strictEqual(await service.isAllowedValue(7), false)
})

/* ------------------------------------------------------------ ordering -- */

test('the order given is the order kept', async () => {
    await service.reorder(['p_high', 'p_low'])
    assert.deepStrictEqual((await service.list()).map(p => p.id), ['p_high', 'p_low'])
})

test('an unknown id in the order is refused whole', async () => {
    await rejects(() => service.reorder(['p_high', 'p_ghost']), 400)
    assert.deepStrictEqual((await service.list()).map(p => p.id), ['p_low', 'p_high'])
})

test('an empty order is refused', async () => {
    await rejects(() => service.reorder([]), 400)
})
