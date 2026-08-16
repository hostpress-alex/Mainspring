/**
 * Who gets told what.
 *
 * The recipient rules are the whole feature. Everything else — a table, a
 * list, a bell — is plumbing that either works or visibly does not. These
 * rules fail quietly: nobody notices a notification that was never sent, and
 * the ones that should not have been sent are only ever felt as "this list is
 * useless".
 *
 * The functions tested here are pure, so no database is involved.
 */
const test = require('node:test')
const assert = require('node:assert')

const notify = require('../api/notification/notification.service')

/* ------------------------------------------------------------ addedIds -- */

test('finds the ids that were added', () => {
    assert.deepStrictEqual(notify.addedIds(['a'], ['a', 'b']), ['b'])
})

test('an unchanged list adds nobody', () => {
    assert.deepStrictEqual(notify.addedIds(['a', 'b'], ['b', 'a']), [])
})

test('removing somebody is not an addition', () => {
    assert.deepStrictEqual(notify.addedIds(['a', 'b'], ['a']), [])
})

test('the same id twice is one addition', () => {
    assert.deepStrictEqual(notify.addedIds([], ['a', 'a']), ['a'])
})

test('ids of mixed types are compared as text', () => {
    assert.deepStrictEqual(notify.addedIds([7], ['7']), [])
})

test('a missing list means nothing was added', () => {
    assert.deepStrictEqual(notify.addedIds(['a'], undefined), [])
    assert.deepStrictEqual(notify.addedIds(null, ['a']), ['a'])
})

/* -------------------------------------------------------- addedMembers -- */

test('finds board members that are new', () => {
    const before = [{_id: 'u1', fullname: 'A'}]
    const after = [{_id: 'u1', fullname: 'A'}, {_id: 'u2', fullname: 'B'}]
    assert.deepStrictEqual(notify.addedMembers(before, after), ['u2'])
})

test('renaming a member does not count as an invitation', () => {
    const before = [{_id: 'u1', fullname: 'Old name'}]
    const after = [{_id: 'u1', fullname: 'New name'}]
    assert.deepStrictEqual(notify.addedMembers(before, after), [])
})

/* ------------------------------------------------------- addedComments -- */

test('finds comments that were not there before', () => {
    const before = [{id: 'c1', txt: 'one'}]
    const after = [{id: 'c2', txt: 'two'}, {id: 'c1', txt: 'one'}]
    const added = notify.addedComments(before, after)
    assert.strictEqual(added.length, 1)
    assert.strictEqual(added[0].id, 'c2')
})

test('editing a comment does not count as a new one', () => {
    const before = [{id: 'c1', txt: 'before'}]
    const after = [{id: 'c1', txt: 'after'}]
    assert.deepStrictEqual(notify.addedComments(before, after), [])
})

test('deleting a comment notifies nobody', () => {
    assert.deepStrictEqual(notify.addedComments([{id: 'c1'}, {id: 'c2'}], [{id: 'c1'}]), [])
})

test('a task that had no comments yet still works', () => {
    const added = notify.addedComments(undefined, [{id: 'c1', txt: 'first'}])
    assert.strictEqual(added.length, 1)
})

/* ------------------------------------------------------ changedColumns -- */

const columns = [
    {id: 'c1', type: 'status', field: 'status', title: 'Status'},
    {id: 'c2', type: 'priority', field: 'priority', title: 'Priority'},
    {id: 'c3', type: 'date', field: 'dueDate', title: 'Date'},
    {id: 'c4', type: 'text', field: 'c4', title: 'Note'}
]

test('a status change is worth a notification', () => {
    const changes = notify.changedColumns({status: 'Done'}, {status: 'Stuck'}, columns)
    assert.strictEqual(changes.length, 1)
    assert.deepStrictEqual(changes[0], {field: 'status', title: 'Status', from: 'Stuck', to: 'Done'})
})

test('other column types are not', () => {
    // A corrected date or a typo in a note is activity-log material. Waking
    // somebody for it is how the list stops being read.
    const changes = notify.changedColumns({dueDate: 123, c4: 'typo fixed'}, {}, columns)
    assert.deepStrictEqual(changes, [])
})

test('writing the same value again changes nothing', () => {
    assert.deepStrictEqual(notify.changedColumns({status: 'Done'}, {status: 'Done'}, columns), [])
})

test('a first value counts as a change', () => {
    const changes = notify.changedColumns({status: 'Done'}, {}, columns)
    assert.strictEqual(changes.length, 1)
    assert.strictEqual(changes[0].from, null)
})

test('a field with no column behind it is ignored', () => {
    assert.deepStrictEqual(notify.changedColumns({whatever: 'x'}, {}, columns), [])
})

test('status and priority in one patch give two entries', () => {
    const changes = notify.changedColumns({status: 'Done', priority: 'High'}, {}, columns)
    assert.strictEqual(changes.length, 2)
})

test('a board without columns notifies nothing', () => {
    assert.deepStrictEqual(notify.changedColumns({status: 'Done'}, {}, undefined), [])
})

test('title and memberIds do not come through here', () => {
    // They are their own event kinds; letting them fall through would send
    // two notifications for one change.
    assert.deepStrictEqual(notify.changedColumns({title: 'New', memberIds: ['u1']}, {}, columns), [])
})

/* --------------------------------------------------------------- preview -- */

test('a comment preview is cut and tidied', () => {
    assert.strictEqual(notify.preview('  hello   world  '), 'hello world')
    const long = 'x'.repeat(300)
    assert.ok(notify.preview(long).length <= notify.COMMENT_PREVIEW)
    assert.ok(notify.preview(long).endsWith('…'))
})

test('an empty comment previews as empty rather than throwing', () => {
    assert.strictEqual(notify.preview(null), '')
    assert.strictEqual(notify.preview(undefined), '')
})

/* ------------------------------------------------------------- mentions -- */

test('finds the ids mentioned in a comment', () => {
    const txt = 'Danke @[Alex Neumann](u_9f3c) — und @[Chris](u_11) schaut mit drauf'
    assert.deepStrictEqual(notify.mentionedIds(txt), ['u_9f3c', 'u_11'])
})

test('the same person twice is one mention', () => {
    assert.deepStrictEqual(notify.mentionedIds('@[A](u_1) und nochmal @[A](u_1)'), ['u_1'])
})

test('an @ without a token is not a mention', () => {
    // Somebody typing an address, or an @ they never picked a name for, has
    // not mentioned anybody.
    assert.deepStrictEqual(notify.mentionedIds('schreib an alex@example.com'), [])
    assert.deepStrictEqual(notify.mentionedIds('@Alex kannst du mal'), [])
})

test('comments from before mentions existed have none', () => {
    assert.deepStrictEqual(notify.mentionedIds('ganz normaler alter Kommentar'), [])
    assert.deepStrictEqual(notify.mentionedIds(''), [])
    assert.deepStrictEqual(notify.mentionedIds(null), [])
})

test('a name containing brackets does not break the pattern', () => {
    assert.deepStrictEqual(notify.mentionedIds('@[Alex (Vertrieb)](u_5)'), ['u_5'])
})

test('the preview shows the name, not the markup', () => {
    assert.strictEqual(notify.toPlain('Hi @[Alex Neumann](u_9f3c), kurz?'), 'Hi @Alex Neumann, kurz?')
    assert.strictEqual(notify.preview('Hi @[Alex Neumann](u_9f3c),   kurz?'), 'Hi @Alex Neumann, kurz?')
})
