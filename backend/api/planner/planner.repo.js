/**
 * Everything the planner needs to know, in as few queries as possible.
 *
 * The planner itself (planner.core) knows nothing about boards, columns or
 * tracked time — it takes a list of work and a list of busy intervals. This
 * file is the translation, and it is where all the awkwardness lives:
 *
 *   - Which key holds an estimate, a deadline or a priority differs per
 *     board, because a column carries its own field. So the columns are read
 *     first and the tasks are interpreted against them.
 *   - What is left of a task is not stored anywhere. It is the estimate minus
 *     the time already recorded on it — which is why nobody has to report
 *     progress for the plan to move on.
 *   - "Finished" is a marked label on the board's status column, not a word.
 *     The rule for which label that is lives in board.service, and is read
 *     from there rather than repeated here.
 */
const {db, parseJson} = require('../../db/knex')
const {doneTitleOfLabels, isDoneTitle} = require('../board/board.service')
const {DEFAULT_TASK_MIN} = require('./planner.core')

const sid = v => (v === undefined || v === null)?'':String(v)

/* --------------------------------------------------------------- busy -- */

/**
 * The times this person is not available.
 *
 * Their own calendar entries — the ones a human put there — and everything
 * that came out of Google. Blocks the planner itself wrote are deliberately
 * NOT in here: it is about to throw them away and lay them again, and
 * treating its own work as immovable would mean the first plan of the week
 * decides the rest of it.
 */
async function busyFor(userId, from, to){
    const [entries, events] = await Promise.all([
        db()('schedule')
            .where({user_id: sid(userId), source: 'manual'})
            .where('start_at', '<', new Date(to)).where('end_at', '>', new Date(from))
            .select('start_at', 'end_at'),
        db()('external_event')
            .where({user_id: sid(userId)})
            .where('start_at', '<', new Date(to)).where('end_at', '>', new Date(from))
            .select('start_at', 'end_at')
    ])
    return [...entries, ...events].map(row => ({
        start: new Date(row.start_at).getTime(),
        end: new Date(row.end_at).getTime()
    }))
}

/* --------------------------------------------------------- candidates -- */

/** The global priority list as {id: rank}, top of the list = rank 0. */
async function priorityRanks(){
    const rows = await db()('priority').orderBy([{column: 'position'}, {column: 'title'}]).select('id')
    const ranks = {}
    rows.forEach((row, i) => {
        ranks[row.id] = i
    })
    return ranks
}

/**
 * The work assigned to this person that still has something left in it.
 *
 * Skipped, and each for its own reason:
 *   - tasks in a status that means finished — that is what the mark is for;
 *   - tasks that have children, because the children carry the work and
 *     planning both would count it twice;
 *   - tasks where the recorded time has already reached the estimate.
 */
async function candidatesFor(userId){
    const rows = await db()('task')
        .join('task_member', function(){
            this.on('task_member.board_id', '=', 'task.board_id')
                .andOn('task_member.task_id', '=', 'task.id')
        })
        .where('task_member.user_id', sid(userId))
        .where('task.state', 'active')
        .select('task.board_id', 'task.id', 'task.group_id', 'task.title', 'task.col_values', 'task.parent_id')
    if(!rows.length) return {tasks: [], skipped: []}

    const boardIds = [...new Set(rows.map(r => r.board_id))]
    const [columns, boards, groups, parents, tracked, planned, ranks] = await Promise.all([
        db()('board_column').whereIn('board_id', boardIds).select('board_id', 'id', 'type', 'field', 'settings'),
        db()('board').whereIn('id', boardIds).select('id', 'title'),
        db()('board_group').whereIn('board_id', boardIds).select('board_id', 'id', 'title', 'color'),
        db()('task').whereIn('board_id', boardIds).where('state', 'active').whereNotNull('parent_id')
            .select('board_id', 'parent_id'),
        db()('task_time').whereIn('board_id', boardIds).whereNotNull('ended_at')
            .select('task_id').sum({ms: db().raw('ended_at - started_at')}).groupBy('task_id'),
        /**
         * Time this person has put in their own calendar for a task.
         *
         * Only in the FUTURE, and that is the whole trick against counting
         * the same work twice: an hour somebody blocked out last Tuesday
         * either got done — then it is in the recorded time above — or it did
         * not, and then it should not shorten anything. What is still ahead
         * is a commitment nobody has made good on yet, and the planner has no
         * business planning the same hour a second time.
         */
        db()('schedule')
            .where({user_id: sid(userId), source: 'manual'})
            .where('end_at', '>', new Date())
            .select('task_id')
            .sum({minutes: db().raw('TIMESTAMPDIFF(MINUTE, start_at, end_at)')})
            .groupBy('task_id'),
        priorityRanks()
    ])

    const boardTitle = new Map(boards.map(b => [b.id, b.title || '']))
    const groupOf = new Map(groups.map(g => [g.board_id + '/' + g.id, g]))
    const hasChildren = new Set(parents.map(p => p.board_id + '/' + p.parent_id))
    const trackedMs = new Map(tracked.map(row => [row.task_id, Number(row.ms) || 0]))
    const plannedMin = new Map(planned.map(row => [row.task_id, Number(row.minutes) || 0]))

    // Per board: which field holds what, and which status means finished.
    const byBoard = new Map()
    for(const column of columns){
        const entry = byBoard.get(column.board_id) || {}
        const field = column.field || column.id
        if(column.type === 'estimate') entry.estimate = field
        if(column.type === 'deadline') entry.deadline = field
        if(column.type === 'priority') entry.priority = field
        if(column.type === 'status'){
            entry.status = field
            const labels = (parseJson(column.settings, {}) || {}).labels
            entry.doneTitle = doneTitleOfLabels(labels)
        }
        byBoard.set(column.board_id, entry)
    }

    const tasks = []
    const skipped = []
    for(const row of rows){
        const board = byBoard.get(row.board_id) || {}
        const values = parseJson(row.col_values, {}) || {}
        const note = reason => skipped.push({taskId: row.id, title: row.title || '', reason})

        if(hasChildren.has(row.board_id + '/' + row.id)){
            note('hasSubtasks')
            continue
        }
        // Two questions, because a status column often has no stored label
        // list at all — see isDoneTitle for why that is not a hypothetical.
        const statusValue = board.status?values[board.status]:null
        if(statusValue && ((board.doneTitle && statusValue === board.doneTitle) || isDoneTitle(statusValue))){
            note('done')
            continue
        }

        const estimate = board.estimate?Number(values[board.estimate]):NaN
        const isAssumed = !(Number.isFinite(estimate) && estimate > 0)
        const total = isAssumed?DEFAULT_TASK_MIN:Math.round(estimate)
        const spent = Math.round((trackedMs.get(row.id) || 0) / 60000)
        const booked = plannedMin.get(row.id) || 0
        const remainingMin = total - spent - booked
        if(remainingMin <= 0){
            note(booked && !spent?'alreadyPlanned':'alreadyWorked')
            continue
        }

        const deadlineRaw = board.deadline?Number(values[board.deadline]):NaN
        const priorityId = board.priority?values[board.priority]:null
        const group = groupOf.get(row.board_id + '/' + row.group_id)

        tasks.push({
            taskId: row.id,
            boardId: row.board_id,
            boardTitle: boardTitle.get(row.board_id) || '',
            groupId: row.group_id,
            groupTitle: group?(group.title || ''):'',
            color: group?(group.color || ''):'',
            title: row.title || '',
            remainingMin,
            totalMin: total,
            spentMin: spent,
            bookedMin: booked,
            isAssumed,
            deadline: Number.isFinite(deadlineRaw)?deadlineRaw:null,
            priorityRank: (priorityId && ranks[priorityId] !== undefined)?ranks[priorityId]:null
        })
    }
    return {tasks, skipped}
}

/* -------------------------------------------------------------- write -- */

/**
 * Replace the planner's own blocks from `from` onwards.
 *
 * Only its own — `source: 'auto'` — and only in the future. A block that has
 * already begun is something somebody may be sitting in right now, and a plan
 * that rewrites the current hour is a plan people stop following.
 */
async function replaceAuto(userId, from, blocks){
    const now = Date.now()
    await db().transaction(async trx => {
        await trx('schedule')
            .where({user_id: sid(userId), source: 'auto'})
            .where('start_at', '>=', new Date(Math.max(from, now)))
            .del()

        if(!blocks.length) return
        await trx('schedule').insert(blocks.map(block => ({
            id: require('crypto').randomBytes(12).toString('hex'),
            user_id: sid(userId),
            board_id: sid(block.boardId),
            board_title: block.boardTitle || '',
            group_id: sid(block.groupId),
            group_title: block.groupTitle || '',
            task_id: sid(block.taskId),
            task_title: block.title || '',
            color: block.color || '',
            start_at: new Date(block.start),
            end_at: new Date(block.end),
            note: '',
            source: 'auto',
            is_assumed: Boolean(block.isAssumed),
            planned_at: now,
            created_at: new Date(),
            updated_at: new Date()
        })))
    })
}

module.exports = {busyFor, candidatesFor, priorityRanks, replaceAuto}
