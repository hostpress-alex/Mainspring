/**
 * Who is told about a reaction, and who is spared.
 *
 * A reaction is the cheapest thing in the product to produce: one click, no
 * typing, and it can be taken back and put on again all afternoon. So the
 * rules that matter are the ones that keep it quiet — the author and nobody
 * else, never yourself, and never twice for the same click.
 *
 * Every dependency is replaced through require.cache, the same way
 * time.test.js does it: what is under test is the decision, not knex.
 */
const test = require('node:test')
const assert = require('node:assert')

const reactionRepoPath = require.resolve('../api/reaction/reaction.repo')
const notificationRepoPath = require.resolve('../api/notification/notification.repo')
const userRepoPath = require.resolve('../api/user/user.repo')
const socketPath = require.resolve('../services/socket.service')
const loggerPath = require.resolve('../services/logger.service')

const AUTHOR = {_id: 'u_author', fullname: 'Author'}
const ACTOR = {_id: 'u_actor', fullname: 'Actor'}

let context = null
let recent = []
let written = []
let pushed = []

function stub(path, exports){
    require.cache[path] = {id: path, filename: path, loaded: true, exports}
}

stub(loggerPath, {warn(){}, error(){}, info(){}, debug(){}})
stub(reactionRepoPath, {
    async commentContext(){ return context }
})
stub(notificationRepoPath, {
    async findRecent(){ return recent },
    async insertMany(entries){
        written.push(...entries)
        return entries.map((e, i) => ({id: i + 1, ...e}))
    }
})
stub(userRepoPath, {
    async findAll(){ return [AUTHOR, ACTOR] }
})
stub(socketPath, {
    emitToUser(msg){ pushed.push(msg) }
})

const notify = require('../api/notification/notification.service')

function baseContext(extra = {}){
    return {
        authorId: AUTHOR._id,
        replyTo: null,
        txt: '<p>Ist erledigt</p>',
        taskTitle: 'Zielgruppen definieren',
        groupId: 'g1',
        taskParentId: null,
        boardTitle: 'Marketing',
        ...extra
    }
}

test.beforeEach(() => {
    context = baseContext()
    recent = []
    written = []
    pushed = []
})

const react = (extra = {}) => notify.commentReacted({
    boardId: 'b1', taskId: 't1', commentId: 'c1', emoji: '👍', actor: ACTOR, ...extra
})

/* -------------------------------------------------------------- who -- */

test('the author of the update is told', async () => {
    const out = await react()
    assert.strictEqual(out.length, 1)
    assert.strictEqual(written.length, 1)
    assert.strictEqual(written[0].userId, AUTHOR._id)
    assert.strictEqual(written[0].kind, 'reaction')
    assert.strictEqual(written[0].detail.emoji, '👍')
    assert.strictEqual(written[0].detail.commentId, 'c1')
})

test('reacting to your own update tells nobody', async () => {
    context = baseContext({authorId: ACTOR._id})
    assert.deepStrictEqual(await react(), [])
    assert.strictEqual(written.length, 0)
})

test('a comment nobody can be found for tells nobody', async () => {
    context = baseContext({authorId: null})
    assert.deepStrictEqual(await react(), [])
})

test('a reaction on a comment that is gone tells nobody', async () => {
    context = null
    assert.deepStrictEqual(await react(), [])
})

/* ------------------------------------------------------------ repeats -- */

test('the same emoji put back on tells nobody a second time', async () => {
    recent = [{actorId: ACTOR._id, detail: {commentId: 'c1', emoji: '👍'}}]
    assert.deepStrictEqual(await react(), [])
})

test('a different emoji from the same person is a new notification', async () => {
    recent = [{actorId: ACTOR._id, detail: {commentId: 'c1', emoji: '👍'}}]
    const out = await react({emoji: '❤️'})
    assert.strictEqual(out.length, 1)
})

test('the same emoji on a different update is a new notification', async () => {
    recent = [{actorId: ACTOR._id, detail: {commentId: 'c9', emoji: '👍'}}]
    assert.strictEqual((await react()).length, 1)
})

test('the same emoji from somebody else is a new notification', async () => {
    recent = [{actorId: 'u_third', detail: {commentId: 'c1', emoji: '👍'}}]
    assert.strictEqual((await react()).length, 1)
})

/* --------------------------------------------------------- what it says -- */

test('a reaction on a reply is marked as one', async () => {
    context = baseContext({replyTo: 'c0'})
    await react()
    assert.strictEqual(written[0].detail.isReply, true)
})

test('a reaction on an update is not marked as a reply', async () => {
    await react()
    assert.strictEqual(written[0].detail.isReply, false)
})

test('the markup of the update does not reach the notification', async () => {
    context = baseContext({txt: '<p>eins</p><p>zwei</p>'})
    await react()
    assert.strictEqual(written[0].detail.text, 'eins zwei')
})

test('the notification carries the way back to the task', async () => {
    await react()
    const entry = written[0]
    assert.strictEqual(entry.boardId, 'b1')
    assert.strictEqual(entry.taskId, 't1')
    assert.strictEqual(entry.detail.groupId, 'g1')
    assert.strictEqual(entry.subject, 'Zielgruppen definieren')
    assert.strictEqual(entry.boardTitle, 'Marketing')
})

test('a reaction on a subtask carries the task above it', async () => {
    context = baseContext({taskParentId: 't_parent'})
    await react()
    assert.strictEqual(written[0].detail.parentId, 't_parent')
})

test('the author is pushed the row over the socket', async () => {
    await react()
    assert.strictEqual(pushed.length, 1)
    assert.strictEqual(pushed[0].userId, AUTHOR._id)
    assert.strictEqual(pushed[0].type, 'notification-added')
})

/* -------------------------------------------------------------- safety -- */

test('a failing lookup does not throw into the caller', async () => {
    require.cache[reactionRepoPath].exports.commentContext = async () => {
        throw new Error('database gone')
    }
    assert.deepStrictEqual(await react(), [])
    require.cache[reactionRepoPath].exports.commentContext = async () => context
})
