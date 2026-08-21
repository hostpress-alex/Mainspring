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
const reactionRepo = require('../reaction/reaction.repo')
const userRepo = require('../user/user.repo')
const socketService = require('../../services/socket.service')
const logger = require('../../services/logger.service')

const sid = v => (v === undefined || v === null)?'':String(v)

/** Column types worth interrupting someone for. */
const NOTIFIED_COLUMN_TYPES = new Set(['status', 'priority'])

/** How much of a comment goes into the list before it is cut. */
const COMMENT_PREVIEW = 140

/**
 * How long the same reaction stays a repeat.
 *
 * A reaction is a toggle, and a toggle invites fiddling: off, on, off, on.
 * Each "on" is a fresh row in the table and would be a fresh notification
 * without this. Inside the window the same person putting the same emoji back
 * on the same comment is silent.
 */
const REACTION_REPEAT_MS = 24 * 60 * 60 * 1000

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

/**
 * A mention as the editor writes it: `<span data-type="mention" data-id="...">`.
 * The attribute order is tiptap's and is stable, but the pattern does not rely
 * on it — `data-id` is looked for anywhere inside the tag.
 */
const MENTION_NODE = /<span[^>]*\bdata-type="mention"[^>]*>/g
const NODE_ID = /\bdata-id="([^"]+)"/

/**
 * The ids mentioned in a comment, each once.
 *
 * Both shapes, because both are in the database: the node the editor writes
 * since rich text arrived, and the `@[Name](id)` token every comment written
 * before that still carries. No migration ran, so this has to read both for
 * as long as the old comments exist — which is forever.
 */
function mentionedIds(text){
    const s = String(text || '')
    const out = new Set()

    MENTION_TOKEN.lastIndex = 0
    let match
    while((match = MENTION_TOKEN.exec(s)) !== null) out.add(match[2])

    MENTION_NODE.lastIndex = 0
    while((match = MENTION_NODE.exec(s)) !== null){
        const id = NODE_ID.exec(match[0])
        if(id) out.add(id[1])
    }
    return [...out]
}

/**
 * Stored form -> readable text, so a preview does not show the markup.
 *
 * Tags are stripped with a regular expression here, and that is safe for
 * exactly one reason: the result is never put into a page. It goes into a
 * notification row and is rendered as text. The frontend has a DOM-based
 * version for anything that reaches the screen — stripping tags with a regex
 * and then displaying the result is how the sanitizer gets bypassed.
 */
function toPlain(text){
    return String(text || '')
        .replace(MENTION_TOKEN, (_, name) => '@' + name)
        // Block ends first, or "one</p><p>two" reads as "onetwo".
        .replace(/<\/(p|div|li|h[1-6]|blockquote|pre)>/gi, ' ')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
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

    // groupId and parentId are navigation data and belong in detail, not in
    // columns of their own: they are read to build a link, never searched.
    const {groupId, parentId, ...rest} = entry
    const rows = await notificationRepo.insertMany(ids.map(userId => ({
        ...rest, userId, actor, createdAt: Date.now(),
        detail: {...(entry.detail || {}), ...(groupId?{groupId}:{}), ...(parentId?{parentId}:{})}
    })))

    // insertMany keeps the order it was given, so rows[i] belongs to ids[i].
    // The row itself carries no user id — the recipient is not the client's
    // business, it only ever receives its own.
    const shown = await withPeople(rows)
    shown.forEach((row, i) => {
        Promise.resolve(socketService.emitToUser({type: 'notification-added', data: row, userId: ids[i]}))
            .catch(() => {})
    })
    return shown
}

/**
 * Fill in who the actor is.
 *
 * The rows carry an id and nothing else. Resolving on the way out means a
 * changed name or picture is right in every notification, including the ones
 * sent last year — the copy that used to sit in the row was correct on the day
 * it was written and wrong from the next profile edit onwards.
 *
 * Used on both ways out: the list the client fetches, and the single row
 * pushed over the socket the moment it is written.
 */
async function withPeople(rows){
    const list = (Array.isArray(rows)?rows:[rows]).filter(Boolean)
    if(!list.length) return rows
    const users = await userRepo.findAll()
    const byId = new Map(users.map(u => [String(u._id), u]))

    const filled = list.map(row => {
        const user = row.actor && row.actor._id?byId.get(String(row.actor._id)):null
        if(!user) return row
        return {...row, actor: {...row.actor, fullname: user.fullname, imgUrl: user.imgUrl || ''}}
    })
    return Array.isArray(rows)?filled:filled[0]
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
async function taskPatched({board, groupId, oldTask, patch, parentId = null, actor}){
    return await safely('taskPatched', async () => {
        const base = {
            boardId: sid(board._id),
            boardTitle: board.title || '',
            taskId: sid(oldTask.id),
            subject: oldTask.title || '',
            // The route to a task is /board/:boardId/:groupId/:taskId, so the
            // group has to travel with the notification — without it a click
            // can only reach the board and the person still has to hunt.
            // It rides in detail rather than a column of its own: it is read
            // to build a link, never searched.
            groupId: sid(groupId),
            // A subtask has no dialog of its own — the task above it opens and
            // the subtask is in the list there. The subscription still hangs
            // off the subtask (taskId above), so only the right people hear
            // about it; parentId is purely how the link is built.
            parentId: parentId?sid(parentId):null
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
                out.push(...await tellAboutComment({base, listeners, onBoard, comment, actor, now}))
            }
        }

        return out
    })
}

/**
 * Who hears about one comment.
 *
 * Lifted out of taskPatched when the API grew a route that appends a single
 * update without rewriting the task. Two copies of this would have drifted,
 * and the way they drift is silent: one path notifies mentions and the other
 * stops doing it after somebody edits only the copy they were looking at.
 */
async function tellAboutComment({base, listeners, onBoard, comment, actor, now}){
    const out = []
    const mentioned = mentionedIds(comment.txt).map(sid).filter(id => onBoard.has(id))
    const detail = {text: preview(comment.txt), commentId: sid(comment.id) || null}

    // A mention reaches you whether or not you follow the task — that is the
    // entire point of typing somebody's name. It also subscribes you, so you
    // hear the answer.
    if(mentioned.length){
        await notificationRepo.subscribe(base.boardId, base.taskId, mentioned, now)
        out.push(...await deliver(mentioned, {...base, kind: 'mention', detail}, actor))
    }

    // and everyone else who was already listening, minus the mentioned — one
    // comment must not arrive twice.
    out.push(...await deliver(
        listeners.filter(id => !mentioned.includes(id)),
        {...base, kind: 'comment', detail}, actor))
    return out
}

/**
 * One update, appended through the API rather than written with the task.
 *
 * Same rules as the browser path, reached from `board.service.addComment`.
 */
async function commentAdded({board, groupId, taskId, subject = '', comment, actor}){
    return await safely('commentAdded', async () => {
        const base = {
            boardId: sid(board._id),
            boardTitle: board.title || '',
            taskId: sid(taskId),
            subject: subject || '',
            groupId: sid(groupId),
            parentId: null
        }
        const now = Date.now()
        // Writing on a task subscribes you to it, same as in the browser.
        if(actor && actor._id) await notificationRepo.subscribe(base.boardId, base.taskId, [sid(actor._id)], now)
        const listeners = (await notificationRepo.subscribersOf(base.boardId, base.taskId))
            .filter(id => !actor || sid(id) !== sid(actor._id))
        const onBoard = new Set((board.members || []).filter(Boolean).map(m => sid(m._id)))
        return await tellAboutComment({base, listeners, onBoard, comment, actor, now})
    })
}

/** A task was created. Only interesting if it arrives already assigned. */
async function taskAdded({board, groupId, task, parentId = null, actor}){
    return await safely('taskAdded', async () => {
        const assigned = addedIds([], task && task.memberIds)
        if(!assigned.length) return []
        const boardId = sid(board._id)
        const taskId = sid(task.id)
        await notificationRepo.subscribe(boardId, taskId, assigned, Date.now())
        return await deliver(assigned, {
            boardId, boardTitle: board.title || '', taskId, groupId: sid(groupId),
            parentId: parentId?sid(parentId):null,
            subject: task.title || '', kind: 'assigned', detail: {}
        }, actor)
    })
}

/** People added to a board. */
/**
 * A rule did something to a task.
 *
 * The actor is deliberately null: nobody did this, the board did. `deliver`
 * drops the actor from the recipients so that a person is never told about
 * their own doing — here there is no own doing, and whoever the rule names
 * gets told even if they caused the change themselves. That is the point of
 * asking to be notified.
 */
async function automationFired({board, groupId, taskId, subject, userIds, summary}){
    return await safely('automationFired', async () => {
        return await deliver(userIds || [], {
            boardId: sid(board._id),
            boardTitle: board.title || '',
            taskId: taskId?sid(taskId):null,
            groupId: sid(groupId),
            subject: subject || '',
            kind: 'automation',
            detail: {summary: String(summary || '')}
        }, null)
    })
}

/**
 * Somebody reacted to an update or a reply.
 *
 * One recipient only: whoever wrote the thing. A reaction is addressed to the
 * author and to nobody else — sending it to the task's subscribers would mean
 * fifteen people hearing about every thumb, which is exactly how a
 * notification list becomes something people switch off.
 *
 * Reacting to your own update is silent. `deliver` would drop it anyway, but
 * the early return saves two reads on the common case of somebody clicking a
 * thumb on their own line to see what it does.
 *
 * Removing a reaction sends nothing — the caller only rings on the way on.
 */
async function commentReacted({boardId, taskId, commentId, emoji, actor}){
    return await safely('commentReacted', async () => {
        const context = await reactionRepo.commentContext(boardId, taskId, commentId)
        if(!context) return []

        const authorId = sid(context.authorId)
        const actorId = sid(actor && actor._id)
        if(!authorId || authorId === actorId) return []

        const recent = await notificationRepo.findRecent(authorId, 'reaction', Date.now() - REACTION_REPEAT_MS)
        const isRepeat = recent.some(row =>
            sid(row.actorId) === actorId &&
            sid(row.detail.commentId) === sid(commentId) &&
            row.detail.emoji === emoji)
        if(isRepeat) return []

        return await deliver([authorId], {
            boardId: sid(boardId),
            boardTitle: context.boardTitle,
            taskId: sid(taskId),
            subject: context.taskTitle,
            groupId: sid(context.groupId),
            // The task above this one, if this is a subtask — not the comment
            // this reply hangs under. See commentContext.
            parentId: context.taskParentId?sid(context.taskParentId):null,
            kind: 'reaction',
            detail: {
                emoji,
                commentId: sid(commentId),
                text: preview(context.txt),
                // So the line can say "your reply" instead of "your update".
                isReply: Boolean(context.replyTo)
            }
        }, actor)
    })
}

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
    withPeople,
    taskPatched,
    taskAdded,
    commentAdded,
    commentReacted,
    boardMembersChanged,
    automationFired,
    // exported for the tests
    mentionedIds,
    toPlain,
    addedIds,
    addedMembers,
    addedComments,
    changedColumns,
    preview,
    NOTIFIED_COLUMN_TYPES,
    COMMENT_PREVIEW,
    REACTION_REPEAT_MS
}
