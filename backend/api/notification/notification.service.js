/**
 * Turning things that happened into things people are told.
 *
 * An activity and a notification are not the same object. An activity is a
 * fact about a board — it happened, it is in the log, everybody can look. A
 * notification is that fact addressed to one person, with a read state. This
 * file is the step in between: deciding who, if anyone, should hear about it.
 *
 * Three rules do most of the work, and all three are about sending *less*:
 *
 *   1. You are never told about your own doing. Without this, every list is
 *      half your own echo and people stop reading it.
 *   2. Only subscribers of a task hear about it. Membership of the board is
 *      not enough — that is the difference between a notification list and a
 *      firehose.
 *   3. Only status and priority raise a notification, not every column. A
 *      value change is worth a line in the activity log; it is not worth
 *      interrupting somebody over a corrected number.
 *
 * Nothing here throws into the caller. A notification that fails to be
 * written must never take the write that triggered it down with it — the
 * board change is the real work, this is commentary on it.
 */
const notificationRepo = require('./notification.repo')
const socketService = require('../../services/socket.service')
const logger = require('../../services/logger.service')

const sid = v => (v === undefined || v === null)?'':String(v)

/** Column types worth interrupting someone for. */
const NOTIFIED_COLUMN_TYPES = new Set(['status', 'priority'])

/** How much of a comment goes into the list before it is cut. */
const COMMENT_PREVIEW = 140

/**
 * `@[Name](id)` — the stored form of a mention.
 *
 * Deliberately a copy of the pattern in the frontend's services/mention.js and
 * not a shared module: the two halves have no shared code at all today, and a
 * `shared/` package with npm workspaces for one regular expression costs more
 * than it saves. If a second thing ever needs sharing, that is the moment to
 * build it — and both places carry this note so the copy is found.
 */
const MENTION_TOKEN = /@\[([^\]\n]+)\]\(([^)\s]+)\)/g

/** The ids mentioned in a comment, each once. */
function mentionedIds(text){
    const out = new Set()
    MENTION_TOKEN.lastIndex = 0
    let match
    while((match = MENTION_TOKEN.exec(String(text || ''))) !== null) out.add(match[2])
    return [...out]
}

/** Stored form -> readable text, so a preview does not show the markup. */
function toPlain(text){
    return String(text || '').replace(MENTION_TOKEN, (_, name) => '@' + name)
}

/* ------------------------------------------------------------ pure bits -- */

/** Ids in `after` that were not in `before`. */
function addedIds(before, after){
    if(!Array.isArray(after)) return []
    const had = new Set((Array.isArray(before)?before:[]).map(sid))
    return [...new Set(after.map(sid).filter(Boolean))].filter(id => !had.has(id))
}

/** Members in `after` that were not in `before`, by _id. */
function addedMembers(before, after){
    const beforeIds = (Array.isArray(before)?before:[]).filter(Boolean).map(m => sid(m._id))
    const afterIds = (Array.isArray(after)?after:[]).filter(Boolean).map(m => sid(m._id))
    return addedIds(beforeIds, afterIds)
}

/** Comments in `after` that were not in `before`, by id. */
function addedComments(before, after){
    if(!Array.isArray(after)) return []
    const had = new Set((Array.isArray(before)?before:[]).filter(Boolean).map(c => sid(c.id)))
    return after.filter(c => c && !had.has(sid(c.id)))
}

/**
 * Which of the patched fields are worth telling somebody about.
 *
 * The patch is keyed by column *field*, so the board's column list is what
 * turns `{status: 'Done'}` into "Status: Working on it -> Done".
 */
function changedColumns(patch, oldTask, columns){
    if(!patch || typeof patch !== 'object') return []
    const byField = new Map((Array.isArray(columns)?columns:[])
        .filter(c => c && NOTIFIED_COLUMN_TYPES.has(c.type))
        .map(c => [c.field, c]))

    const out = []
    for(const [key, to] of Object.entries(patch)){
        const column = byField.get(key)
        if(!column) continue
        const from = oldTask?oldTask[key]:undefined
        if(sid(from) === sid(to)) continue
        out.push({field: key, title: column.title || key, from: from ?? null, to: to ?? null})
    }
    return out
}

function preview(text){
    const s = toPlain(text).replace(/\s+/g, ' ').trim()
    return s.length > COMMENT_PREVIEW?s.slice(0, COMMENT_PREVIEW - 1) + '…':s
}

/* -------------------------------------------------------------- sending -- */

/**
 * Write the rows and push them out.
 *
 * The actor is dropped here rather than at every call site, so rule 1 cannot
 * be forgotten in a new event type later on.
 */
async function deliver(recipients, entry, actor){
    const actorId = sid(actor && actor._id)
    const ids = [...new Set(recipients.map(sid).filter(Boolean))].filter(id => id !== actorId)
    if(!ids.length) return []

    const rows = await notificationRepo.insertMany(ids.map(userId => ({
        ...entry, userId, actor, createdAt: Date.now()
    })))

    // insertMany keeps the order it was given, so rows[i] belongs to ids[i].
    // The row itself carries no user id — the recipient is not the client's
    // business, it only ever receives its own.
    rows.forEach((row, i) => {
        Promise.resolve(socketService.emitToUser({type: 'notification-added', data: row, userId: ids[i]}))
            .catch(() => {})
    })
    return rows
}

/** Anything in here is commentary — it must not break the write it follows. */
async function safely(what, fn){
    try {
        return await fn()
    } catch(err){
        logger.error(`notification (${what}) failed`, err)
        return []
    }
}

/* --------------------------------------------------------------- events -- */

/**
 * A task was patched. Covers three of the four event kinds, because
 * assignment, value changes and comments all arrive as one patch.
 *
 * `oldTask` is the task as it was before the write; the caller already has it
 * because it had to load the board to check permissions.
 */
async function taskPatched({board, oldTask, patch, actor}){
    return await safely('taskPatched', async () => {
        const base = {
            boardId: sid(board._id),
            boardTitle: board.title || '',
            taskId: sid(oldTask.id),
            subject: oldTask.title || ''
        }
        const now = Date.now()
        const out = []

        // Newly assigned people. They are told, and they start listening.
        const assigned = addedIds(oldTask.memberIds, patch.memberIds)
        if(assigned.length){
            await notificationRepo.subscribe(base.boardId, base.taskId, assigned, now)
            out.push(...await deliver(assigned, {...base, kind: 'assigned', detail: {}}, actor))
        }

        // Everything below goes to whoever is listening, minus the newly
        // assigned — being added and immediately told what changed is noise.
        const listeners = (await notificationRepo.subscribersOf(base.boardId, base.taskId))
            .filter(id => !assigned.includes(id))

        const changes = changedColumns(patch, oldTask, board.columns)
        for(const change of changes){
            out.push(...await deliver(listeners, {
                ...base, kind: 'value',
                detail: {column: change.title, from: change.from, to: change.to}
            }, actor))
        }

        const comments = addedComments(oldTask.comments, patch.comments)
        if(comments.length){
            // Writing on a task subscribes you to it, same as Monday.
            if(actor && actor._id) await notificationRepo.subscribe(base.boardId, base.taskId, [sid(actor._id)], now)

            // Only people who can open the board. Mentioning somebody who
            // cannot get in produces a notification that leads to a locked
            // door — worse than not being mentioned at all.
            const onBoard = new Set((board.members || []).filter(Boolean).map(m => sid(m._id)))

            for(const comment of comments){
                const mentioned = mentionedIds(comment.txt).map(sid).filter(id => onBoard.has(id))
                const detail = {text: preview(comment.txt), commentId: sid(comment.id) || null}

                // A mention reaches you whether or not you follow the task —
                // that is the entire point of typing somebody's name. It also
                // subscribes you, so you hear the answer.
                if(mentioned.length){
                    await notificationRepo.subscribe(base.boardId, base.taskId, mentioned, now)
                    out.push(...await deliver(mentioned, {...base, kind: 'mention', detail}, actor))
                }

                // and everyone else who was already listening, minus the
                // mentioned — one comment must not arrive twice.
                out.push(...await deliver(
                    listeners.filter(id => !mentioned.includes(id)),
                    {...base, kind: 'comment', detail}, actor))
            }
        }

        return out
    })
}

/** A task was created. Only interesting if it arrives already assigned. */
async function taskAdded({board, task, actor}){
    return await safely('taskAdded', async () => {
        const assigned = addedIds([], task && task.memberIds)
        if(!assigned.length) return []
        const boardId = sid(board._id)
        const taskId = sid(task.id)
        await notificationRepo.subscribe(boardId, taskId, assigned, Date.now())
        return await deliver(assigned, {
            boardId, boardTitle: board.title || '', taskId,
            subject: task.title || '', kind: 'assigned', detail: {}
        }, actor)
    })
}

/** People added to a board. */
async function boardMembersChanged({board, members, actor}){
    return await safely('boardMembersChanged', async () => {
        const invited = addedMembers(board.members, members)
        if(!invited.length) return []
        return await deliver(invited, {
            boardId: sid(board._id), boardTitle: board.title || '',
            taskId: null, subject: board.title || '', kind: 'invited', detail: {}
        }, actor)
    })
}

module.exports = {
    taskPatched,
    taskAdded,
    boardMembersChanged,
    // exported for the tests
    mentionedIds,
    toPlain,
    addedIds,
    addedMembers,
    addedComments,
    changedColumns,
    preview,
    NOTIFIED_COLUMN_TYPES,
    COMMENT_PREVIEW
}
