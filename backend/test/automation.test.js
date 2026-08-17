/**
 * Automations: what fires, and what stops.
 *
 * Two halves. The first is the engine, which is pure and can simply be asked.
 * The second is the thing that actually goes wrong in production — a rule that
 * sets a value, which is a change, which runs a rule, which sets a value. That
 * one is exercised through the real service with a replaced repository and a
 * replaced board service, so the async context that carries the chain depth is
 * the real AsyncLocalStorage and not a stand-in.
 */
const test = require('node:test')
const assert = require('node:assert')

// No waiting in the tests. The delay is real behaviour and has its own test
// below; everywhere else it would only make the suite slow and flaky.
process.env.AUTOMATION_DELAY_MS = '0'

const engine = require('../api/automation/automation.engine')

const COLUMNS = [
    {id: 'c1', type: 'status', title: 'Status', field: 'status'},
    {id: 'c2', type: 'priority', title: 'Prio', field: 'priority'},
    {id: 'c3', type: 'text', title: 'Notiz', field: 'note'},
    {id: 'c4', type: 'text', title: 'Extra', field: 'extra'}
]
const BOARD = {
    _id: '0123456789abcdef01234567',
    title: 'Board',
    columns: COLUMNS,
    groups: [{id: 'g1', title: 'Offen'}, {id: 'g2', title: 'Erledigt'}]
}

const statusToDone = {
    id: 'a1', enabled: true,
    trigger: {type: 'status_changes_to', field: 'status', value: 'Erledigt'},
    actions: [{type: 'move_to_group', groupId: 'g2'}]
}

/* --------------------------------------------------------------- match -- */

test('a status rule fires on its value and no other', () => {
    const event = kind => ({kind, groupId: 'g1', task: {id: 't1'},
        changes: [{field: 'status', from: 'Offen', to: 'Erledigt'}]})
    assert.strictEqual(engine.matches(statusToDone, event('changed')), true)

    const other = {kind: 'changed', groupId: 'g1', task: {id: 't1'},
        changes: [{field: 'status', from: 'Offen', to: 'Review'}]}
    assert.strictEqual(engine.matches(statusToDone, other), false)
})

test('a disabled rule never fires', () => {
    const off = {...statusToDone, enabled: false}
    assert.strictEqual(engine.matches(off, {kind: 'changed', task: {},
        changes: [{field: 'status', to: 'Erledigt'}]}), false)
})

test('a rule with an unknown trigger never fires', () => {
    // A board written by a newer version must not do something arbitrary.
    const strange = {...statusToDone, trigger: {type: 'when_the_moon_is_full'}}
    assert.strictEqual(engine.matches(strange, {kind: 'changed', task: {}, changes: []}), false)
})

test('"when the column changes" does not care about the value', () => {
    const rule = {enabled: true, trigger: {type: 'column_changes', field: 'priority'}, actions: []}
    assert.strictEqual(engine.matches(rule, {kind: 'changed', task: {},
        changes: [{field: 'priority', to: 'egal'}]}), true)
    assert.strictEqual(engine.matches(rule, {kind: 'changed', task: {},
        changes: [{field: 'status', to: 'egal'}]}), false)
})

test('"when an item is created" fires only on a new task', () => {
    const rule = {enabled: true, trigger: {type: 'item_created'}, actions: []}
    assert.strictEqual(engine.matches(rule, {kind: 'created', task: {}}), true)
    assert.strictEqual(engine.matches(rule, {kind: 'changed', task: {}, changes: []}), false)
})

/* ------------------------------------------------------------- changes -- */

test('writing the value that is already there is not a change', () => {
    // The frontend sends whole objects. Without this every save would look
    // like an edit of every column and every rule would run on every save.
    const changes = engine.changesOf({status: 'Offen'}, {status: 'Offen'}, COLUMNS)
    assert.deepStrictEqual(changes, [])
})

test('only the board\'s own columns count as a change', () => {
    const changes = engine.changesOf(
        {title: 'Anderer Titel', comments: [{id: 'c'}], status: 'Erledigt'},
        {title: 'Alt', comments: [], status: 'Offen'}, COLUMNS)
    assert.deepStrictEqual(changes.map(c => c.field), ['status'])
})

/* ---------------------------------------------------------------- plan -- */

test('an action that would change nothing is skipped', () => {
    const rule = {actions: [{type: 'set_value', field: 'status', value: 'Erledigt'}]}
    const planned = engine.plan(rule, {groupId: 'g1', task: {id: 't1', status: 'Erledigt'}})
    assert.strictEqual(planned[0].skip, 'unchanged')
})

test('a move into the group the task is already in is skipped', () => {
    const planned = engine.plan(statusToDone, {groupId: 'g2', task: {id: 't1'}})
    assert.strictEqual(planned[0].skip, 'unchanged')
})

/* ------------------------------------------------------------ validate -- */

test('a rule pointing at a column that does not exist is refused', () => {
    const problems = engine.validate({
        trigger: {type: 'status_changes_to', field: 'gibtsnicht', value: 'x'},
        actions: [{type: 'move_to_group', groupId: 'g2'}]
    }, BOARD)
    assert.strictEqual(problems.length, 1)
})

test('a rule without an action is refused', () => {
    const problems = engine.validate({
        trigger: {type: 'item_created'}, actions: []
    }, BOARD)
    assert.ok(problems.length)
})

test('a sound rule has nothing to complain about', () => {
    assert.deepStrictEqual(engine.validate(statusToDone, BOARD), [])
})

/* ----------------------------------------------------------- the chain -- */

/**
 * From here on the real service runs, with the database and the board service
 * replaced. The point is the async context: the chain depth and the set of
 * rules already fired travel in AsyncLocalStorage, and a stand-in for that
 * would test the stand-in.
 */
const repoPath = require.resolve('../api/automation/automation.repo')
const userRepoPath = require.resolve('../api/user/user.repo')
const boardServicePath = require.resolve('../api/board/board.service')
const notificationPath = require.resolve('../api/notification/notification.service')

let RULES = []
const runs = []

require.cache[repoPath] = {
    id: repoPath, filename: repoPath, loaded: true,
    exports: {
        findLive: async (boardId, type) => RULES.filter(r => r.trigger.type === type && r.enabled),
        addRun: async entry => { runs.push(entry) }
    }
}
require.cache[userRepoPath] = {
    id: userRepoPath, filename: userRepoPath, loaded: true,
    exports: {findById: async id => (id?{_id: id, fullname: 'Owner'}:null)}
}
require.cache[notificationPath] = {
    id: notificationPath, filename: notificationPath, loaded: true,
    exports: {automationFired: async () => []}
}

const task = {id: 't1', title: 'Task', status: 'Offen', priority: '', note: '', extra: ''}

/**
 * Stands in for the real write path: apply the patch and raise the event the
 * board service would raise. That is what makes a rule able to start another.
 */
require.cache[boardServicePath] = {
    id: boardServicePath, filename: boardServicePath, loaded: true,
    exports: {
        updateTaskFields: async (boardId, groupId, taskId, patch) => {
            const before = {...task}
            Object.assign(task, patch)
            automationService.fire({
                board: BOARD, kind: 'changed', groupId, task: {...task},
                changes: engine.changesOf(patch, before, COLUMNS)
            })
        },
        moveTask: async () => {}
    }
}

const automationService = require('../api/automation/automation.service')

function reset(rules){
    RULES = rules
    runs.length = 0
    Object.assign(task, {id: 't1', title: 'Task', status: 'Offen', priority: '', note: '', extra: ''})
}

const chainRule = (id, watch, write, value) => ({
    id, enabled: true, createdBy: 'u_owner',
    trigger: {type: 'column_changes', field: watch},
    actions: [{type: 'set_value', field: write, value}]
})

test('two rules that feed each other stop after one round', async () => {
    // "status changes -> set priority" and "priority changes -> set status".
    // Left alone this is a loop; it stops because a rule fires at most once
    // per chain.
    reset([chainRule('a', 'status', 'priority', 'Hoch'),
        chainRule('b', 'priority', 'status', 'Erledigt')])

    automationService.fire({
        board: BOARD, kind: 'changed', groupId: 'g1', task: {...task},
        changes: [{field: 'status', from: 'Offen', to: 'Erledigt'}]
    })
    await automationService.settle()

    // Sorted, because the order is the reverse of what it looks like: a rule
    // is written down when it has finished, and the rule it started finishes
    // first. That is worth knowing when reading the log, and not worth
    // asserting a particular way round.
    const done = runs.filter(r => r.outcome === 'done')
    assert.deepStrictEqual(done.map(r => r.automationId).sort(), ['a', 'b'])
    const skipped = runs.filter(r => r.outcome === 'skipped')
    assert.ok(skipped.length >= 1, 'the second turn of the first rule is refused')
})

test('a chain of separate rules is cut at the depth limit', async () => {
    // Four rules in a row, none of them repeating: only the depth limit can
    // stop this one.
    // Each one watches a column of its own, so only the first is started by
    // the event itself and every later one is started by its predecessor.
    reset([
        chainRule('r1', 'status', 'priority', 'Hoch'),
        chainRule('r2', 'priority', 'note', 'eins'),
        chainRule('r3', 'note', 'extra', 'zwei'),
        chainRule('r4', 'extra', 'status', 'Review')
    ])

    automationService.fire({
        board: BOARD, kind: 'changed', groupId: 'g1', task: {...task},
        changes: [{field: 'status', from: 'Offen', to: 'Erledigt'}]
    })
    await automationService.settle()

    const done = runs.filter(r => r.outcome === 'done').map(r => r.automationId)
    assert.strictEqual(done.length, automationService.MAX_DEPTH,
        'no more rules run than the limit allows')
    const cut = runs.find(r => r.outcome === 'skipped' && /Chain longer/.test(r.summary))
    assert.ok(cut, 'and the one that was cut says so in the log')
})

test('a rule whose actions change nothing is written down as skipped', async () => {
    reset([chainRule('a', 'status', 'priority', 'Hoch')])
    task.priority = 'Hoch'

    automationService.fire({
        board: BOARD, kind: 'changed', groupId: 'g1', task: {...task},
        changes: [{field: 'status', from: 'Offen', to: 'Erledigt'}]
    })
    await automationService.settle()

    assert.strictEqual(runs.length, 1)
    assert.strictEqual(runs[0].outcome, 'skipped')
})

test('nothing has run by the time the write is answered', async () => {
    // The write must not wait for the rule. Checked with a real delay, because
    // the whole point is that fire() returns before anything happens.
    process.env.AUTOMATION_DELAY_MS = '40'
    delete require.cache[require.resolve('../api/automation/automation.service')]
    const delayed = require('../api/automation/automation.service')
    reset([chainRule('a', 'status', 'priority', 'Hoch')])

    delayed.fire({board: BOARD, kind: 'changed', groupId: 'g1', task: {...task},
        changes: [{field: 'status', from: 'Offen', to: 'Erledigt'}]})
    assert.strictEqual(runs.length, 0, 'still nothing right after the write')

    await delayed.settle()
    assert.strictEqual(runs.length, 1, 'and it has run once the wait is over')

    process.env.AUTOMATION_DELAY_MS = '0'
})

test('a rule whose author is gone fails loudly rather than borrowing rights', async () => {
    reset([{...chainRule('a', 'status', 'priority', 'Hoch'), createdBy: null}])

    automationService.fire({
        board: BOARD, kind: 'changed', groupId: 'g1', task: {...task},
        changes: [{field: 'status', from: 'Offen', to: 'Erledigt'}]
    })
    await automationService.settle()

    assert.strictEqual(runs[0].outcome, 'failed')
})
