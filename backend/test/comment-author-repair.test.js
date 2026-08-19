/**
 * Who the log is allowed to name, and — more of the file — who it is not.
 *
 * The repair writes an author into a row that has none. Getting it wrong is
 * not a visible bug: it is a name under somebody else's words, and nothing
 * afterwards can tell it from a real one. So the interesting tests here are
 * the ones that expect null.
 */
const test = require('node:test')
const assert = require('node:assert')

const repair = require('../db/migrations/20260819_000030_comment_author_repair')

const AT = 1787137130585

function comment(over = {}){
    return {board_id: 'b1', task_id: 't1', id: 'c1', parent_id: null,
        created_at: AT, txt: '<p>ukuzk uzkzuk zukzuk zukzuk</p>', ...over}
}

function activity(over = {}){
    return {board_id: 'b1', action: 'update', task_id: 't1', created_at: AT + 60000,
        by_user_id: 'u_alex', to_value: '"ukuzk uzkzuk zukzuk zukzuk"', ...over}
}

/* --------------------------------------------------------------- found -- */

test('the log names the author and the row gets it back', () => {
    assert.strictEqual(repair.pickAuthor(comment(), [activity()]), 'u_alex')
})

test('markup and spacing may differ — the words decide', () => {
    // What the editor stored and what the log kept never agree on whitespace.
    const c = comment({txt: '<p>Schreibtest&nbsp;fuer   den</p><p>Kommentar-Rewrite</p>'})
    const a = activity({to_value: '"Schreibtest fuer den Kommentar-Rewrite"'})
    assert.strictEqual(repair.pickAuthor(c, [a]), 'u_alex')
})

test('the log line is cut off at eighty characters and still matches', () => {
    const long = 'Verlaufstest: dieses Update sollte im Verlauf mit seinem eigenen Typ auftauchen und nicht als Text'
    const c = comment({txt: `<p>${long}</p>`})
    const a = activity({to_value: JSON.stringify(long.slice(0, 79) + '…')})
    assert.strictEqual(repair.pickAuthor(c, [a]), 'u_alex')
})

test('a reply is matched against reply entries', () => {
    const c = comment({parent_id: 'c0', txt: '<p>Antwort fuer den Verlaufstest</p>'})
    const a = activity({action: 'reply', to_value: '"Antwort fuer den Verlaufstest"'})
    assert.strictEqual(repair.pickAuthor(c, [a]), 'u_alex')
})

test('two entries naming the same person are still that person', () => {
    assert.strictEqual(repair.pickAuthor(comment(), [activity(), activity({created_at: AT + 120000})]), 'u_alex')
})

test('an update whose time was never stored is matched on its text alone', () => {
    assert.strictEqual(repair.pickAuthor(comment({created_at: null}), [activity()]), 'u_alex')
})

/* ----------------------------------------------------------- not found -- */

test('nothing in the log means nothing is written', () => {
    assert.strictEqual(repair.pickAuthor(comment(), []), null)
})

test('two people cannot both have written it', () => {
    const other = activity({by_user_id: 'u_john', created_at: AT + 90000})
    assert.strictEqual(repair.pickAuthor(comment(), [activity(), other]), null)
})

test('an entry on another task is not about this update', () => {
    assert.strictEqual(repair.pickAuthor(comment(), [activity({task_id: 't2'})]), null)
})

test('a reply is not matched by the update entry it answers', () => {
    assert.strictEqual(repair.pickAuthor(comment({parent_id: 'c0'}), [activity()]), null)
})

test('an entry from before the update was opened is not about it', () => {
    assert.strictEqual(repair.pickAuthor(comment(), [activity({created_at: AT - 5 * 60000})]), null)
})

test('an entry from hours later is not about it either', () => {
    assert.strictEqual(repair.pickAuthor(comment(), [activity({created_at: AT + 5 * 60 * 60 * 1000})]), null)
})

test('different words, same minute, is still a different update', () => {
    assert.strictEqual(repair.pickAuthor(comment(), [activity({to_value: '"etwas ganz anderes"'})]), null)
})

test('an entry that has lost its own author names nobody', () => {
    assert.strictEqual(repair.pickAuthor(comment(), [activity({by_user_id: null})]), null)
})

test('an update that is only an attachment has nothing to match on', () => {
    // Empty on one side would otherwise be a prefix of everything.
    assert.strictEqual(repair.pickAuthor(comment({txt: '<p></p>'}), [activity({to_value: '""'})]), null)
})

test('two letters are not enough to identify an update', () => {
    const c = comment({txt: '<p>ok</p>'})
    assert.strictEqual(repair.pickAuthor(c, [activity({to_value: '"ok"'})]), null)
})

/* ------------------------------------------------------------- unwrap -- */

test('the log line is read whether or not the driver unpacked it', () => {
    assert.strictEqual(repair.pickAuthor(comment(), [activity({to_value: 'ukuzk uzkzuk zukzuk zukzuk'})]), 'u_alex')
})
