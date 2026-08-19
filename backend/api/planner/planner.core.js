/**
 * The planner, without a database.
 *
 * Everything that decides *what goes where* lives in this file and touches
 * nothing outside it: give it tasks, working hours and the times that are
 * already taken, and it returns blocks. That is the whole reason it was not
 * handed to a language model — this is interval arithmetic over a few dozen
 * items, it has to give the same answer twice, and it has to be explainable
 * to somebody who disagrees with the result. All three are properties of code
 * and none of them are properties of a model.
 *
 * The rules, in the order they apply:
 *
 *   1. A deadline beats everything. Sooner first, and nothing is placed after
 *      the end of its deadline day.
 *   2. Then priority, in the order the list has in the admin screen — the top
 *      of that list is planned first. That is a deliberate handle: whoever
 *      maintains the list decides what "important" means here.
 *   3. Then the longer piece of work, so what needs a run-up gets one.
 *
 * What it never does: place anything in the past, place anything over a time
 * that is already taken, or produce a block shorter than MIN_CHUNK — a
 * calendar cut into eleven-minute slivers is a calendar nobody follows.
 */

const MS_MIN = 60000
const DAY_MIN = 24 * 60

/** Below this, a block is noise rather than a plan. */
const MIN_CHUNK_MIN = 30
/**
 * Above this, one task eats a day and everything else waits.
 *
 * Lifted for work that has a deadline: a deadline is the one thing that
 * justifies spending a whole day on a single task, and capping it there would
 * report "does not fit" for work somebody could comfortably finish in two
 * full days. Without a deadline the cap stays on, so one large task does not
 * swallow a week while five small ones wait behind it.
 */
const MAX_CHUNK_MIN = 240
/** How far ahead the planner is willing to look when nobody says otherwise. */
const HORIZON_DAYS = 21

/**
 * Days left in the week that `ms` falls in, today included.
 *
 * The button plans this week and nothing beyond it: what does not fit by
 * Friday is not squeezed into the following Monday, it waits for the plan
 * that week gets of its own. A calendar that is already full three weeks
 * ahead cannot react to anything.
 *
 * The week starts on Monday, like the calendar grid.
 */
function daysLeftInWeek(ms){
    const weekday = (new Date(ms).getDay() + 6) % 7   // 0 = Monday
    return 7 - weekday
}
/** What a task without an estimate is assumed to take. */
const DEFAULT_TASK_MIN = 60

const startOfDay = ms => {
    const d = new Date(ms)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
}

const addDays = (ms, n) => {
    const d = new Date(ms)
    d.setDate(d.getDate() + n)
    // Not `ms + n * 86400000`: an hour goes missing twice a year, and the
    // planner would put a block at 08:00 on one side of the change and 09:00
    // on the other.
    return d.getTime()
}

/** Round up to the next five minutes, so blocks start on readable times. */
const ceilTo5 = ms => Math.ceil(ms / (5 * MS_MIN)) * (5 * MS_MIN)

/* --------------------------------------------------------------- order -- */

/**
 * The order tasks are planned in.
 *
 * Stable on purpose: two tasks that compare equal keep the order they came
 * in, so a re-run does not shuffle a person's day for no reason.
 */
function orderTasks(tasks){
    return [...tasks]
        .map((task, i) => ({task, i}))
        .sort((a, b) => {
            const da = Number.isFinite(a.task.deadline)?a.task.deadline:Infinity
            const db = Number.isFinite(b.task.deadline)?b.task.deadline:Infinity
            if(da !== db) return da - db

            const pa = Number.isFinite(a.task.priorityRank)?a.task.priorityRank:Infinity
            const pb = Number.isFinite(b.task.priorityRank)?b.task.priorityRank:Infinity
            if(pa !== pb) return pa - pb

            if(a.task.remainingMin !== b.task.remainingMin) return b.task.remainingMin - a.task.remainingMin
            return a.i - b.i
        })
        .map(entry => entry.task)
}

/* ---------------------------------------------------------------- gaps -- */

/** Overlapping or touching intervals, merged. Both callers need this. */
function merge(intervals){
    const sorted = [...intervals].filter(i => i.end > i.start).sort((a, b) => a.start - b.start)
    const out = []
    for(const interval of sorted){
        const last = out[out.length - 1]
        if(last && interval.start <= last.end) last.end = Math.max(last.end, interval.end)
        else out.push({start: interval.start, end: interval.end})
    }
    return out
}

/**
 * What is left of one working day.
 *
 * The window comes from the working hours of that weekday; everything already
 * taken is cut out of it, and so is everything before `notBefore` — which is
 * "now" on the first day and the start of the day after that. Nobody is
 * helped by a plan that plans this morning at four in the afternoon.
 *
 * The break is not an interval here. Where it sits is nobody's business; that
 * it is not working time is. So it comes off the day's capacity, not off a
 * particular hour — see planDays.
 */
function freeIntervals(dayStart, hours, busy, notBefore = 0){
    if(!hours) return []
    const windowStart = Math.max(dayStart + hours.startMin * MS_MIN, notBefore)
    const windowEnd = dayStart + Math.min(hours.endMin, DAY_MIN) * MS_MIN
    if(windowEnd <= windowStart) return []

    const taken = merge(busy.filter(b => b.end > windowStart && b.start < windowEnd))
    const out = []
    let cursor = windowStart
    for(const block of taken){
        if(block.start > cursor) out.push({start: cursor, end: Math.min(block.start, windowEnd)})
        cursor = Math.max(cursor, block.end)
        if(cursor >= windowEnd) break
    }
    if(cursor < windowEnd) out.push({start: cursor, end: windowEnd})
    return out.filter(gap => gap.end > gap.start)
}

/* ---------------------------------------------------------------- plan -- */

/**
 * Lay the work out.
 *
 * Returns the blocks and, just as importantly, what did not fit and why. The
 * second list is the one a person acts on: "three tasks do not fit before
 * their deadline" is the answer they came for, and a planner that quietly
 * drops them is worse than no planner.
 */
function plan({
    tasks = [],
    workHours = [],
    busy = [],
    from = Date.now(),
    horizonDays = HORIZON_DAYS,
    minChunkMin = MIN_CHUNK_MIN,
    maxChunkMin = MAX_CHUNK_MIN
} = {}){
    const hoursByWeekday = new Map(workHours.map(h => [h.weekday, h]))
    const taken = merge(busy)
    const blocks = []
    const unplaced = []
    const notBefore = ceilTo5(from)

    // What is left of each task, in minutes, as we place it.
    const left = new Map()
    for(const task of tasks) left.set(task.taskId, Math.max(0, Math.round(task.remainingMin)))

    for(const task of orderTasks(tasks)){
        let remaining = left.get(task.taskId) || 0
        if(remaining <= 0) continue

        // Nothing may be placed after the end of the deadline's day.
        const limit = Number.isFinite(task.deadline)
            ? addDays(startOfDay(task.deadline), 1)
            : Infinity

        for(let dayIndex = 0; dayIndex < horizonDays && remaining > 0; dayIndex++){
            const dayStart = addDays(startOfDay(notBefore), dayIndex)
            if(dayStart >= limit) break

            const hours = hoursByWeekday.get(new Date(dayStart).getDay())
            if(!hours) continue

            // The unpaid break comes off what this day can carry, wherever it
            // is actually taken.
            const capacity = Math.max(0, hours.endMin - hours.startMin - (hours.breakMin || 0))
            const usedToday = blocks
                .filter(b => b.start >= dayStart && b.start < addDays(dayStart, 1))
                .reduce((sum, b) => sum + (b.end - b.start) / MS_MIN, 0)
            let capacityLeft = capacity - usedToday
            if(capacityLeft < minChunkMin && capacityLeft < remaining) continue

            const gaps = freeIntervals(dayStart, hours, taken, dayIndex === 0?notBefore:0)

            for(const gap of gaps){
                if(remaining <= 0 || capacityLeft <= 0) break
                const gapMin = Math.floor((Math.min(gap.end, limit) - gap.start) / MS_MIN)
                if(gapMin <= 0) continue

                const ceiling = Number.isFinite(task.deadline)?Infinity:maxChunkMin
                let chunk = Math.min(remaining, gapMin, ceiling, capacityLeft)

                /**
                 * Never leave a crumb behind.
                 *
                 * Without this the planner produces the thing it was written
                 * to avoid: a block of five minutes on the next morning,
                 * because the day before ended five minutes short of the
                 * estimate. If what would be left over is too small to be a
                 * block of its own, this block takes it — as long as there is
                 * room for it here.
                 *
                 * Found by running the planner on real data, not by thinking
                 * about it: the rule below it ("place the last sliver anyway")
                 * is right on its own and wrong together with this one.
                 */
                let leftover = remaining - chunk
                if(leftover > 0 && leftover < minChunkMin){
                    // First try to finish it here.
                    chunk = Math.min(remaining, gapMin, capacityLeft)
                    leftover = remaining - chunk
                    if(leftover > 0 && leftover < minChunkMin){
                        // The day is too full for that, so take LESS today
                        // and leave a proper block for tomorrow.
                        const reduced = remaining - minChunkMin
                        if(reduced >= minChunkMin) chunk = reduced
                        // And if it cannot be split sensibly at all, start it
                        // somewhere it fits whole rather than here.
                        else continue
                    }
                }

                // A sliver is not a plan — unless it is all that is left of
                // the task, in which case it finishes it.
                if(chunk < minChunkMin && chunk < remaining) continue

                const start = gap.start
                const end = start + chunk * MS_MIN
                blocks.push({
                    taskId: task.taskId,
                    boardId: task.boardId,
                    groupId: task.groupId,
                    title: task.title,
                    color: task.color,
                    isAssumed: Boolean(task.isAssumed),
                    start,
                    end
                })
                taken.push({start, end})
                taken.sort((a, b) => a.start - b.start)
                remaining -= chunk
                capacityLeft -= chunk

                // One block per task per day. The rest of this task moves to
                // tomorrow, which is what "it was not finished today" is
                // supposed to look like.
                break
            }
        }

        left.set(task.taskId, remaining)
        if(remaining > 0){
            unplaced.push({
                taskId: task.taskId,
                title: task.title,
                remainingMin: remaining,
                reason: Number.isFinite(task.deadline)?'deadline':'horizon'
            })
        }
    }

    return {
        blocks: blocks.sort((a, b) => a.start - b.start),
        unplaced,
        assumedCount: blocks.filter(b => b.isAssumed).length
    }
}

module.exports = {
    plan, orderTasks, freeIntervals, merge, startOfDay, addDays, daysLeftInWeek,
    MIN_CHUNK_MIN, MAX_CHUNK_MIN, HORIZON_DAYS, DEFAULT_TASK_MIN, MS_MIN
}
