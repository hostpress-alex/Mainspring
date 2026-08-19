/**
 * Working hours: the rules, and the week they add up to.
 *
 * Who may write them is the only permission question, and the answer is
 * "yourself, or an admin". Not board roles: how long somebody works is a fact
 * about the person, not about any board they happen to be on.
 */
const workHoursRepo = require('./workhours.repo')

const DAY_MINUTES = 24 * 60

function fail(status, message){
    const err = new Error(message)
    err.status = status
    return err
}

/**
 * One day, checked.
 *
 * A day that ends before it begins, or a break longer than the day, is not a
 * shift somebody typed carelessly — it is a number that would quietly poison
 * every capacity sum it is added to.
 */
function cleanDay(raw){
    const weekday = Number(raw && raw.weekday)
    if(!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw fail(400, 'A weekday is 0 to 6')

    const startMin = Number(raw.startMin)
    const endMin = Number(raw.endMin)
    const breakMin = Number(raw.breakMin || 0)

    for(const [name, value] of [['start', startMin], ['end', endMin], ['break', breakMin]]){
        if(!Number.isInteger(value) || value < 0 || value > DAY_MINUTES){
            throw fail(400, `The ${name} of a day is between 0 and ${DAY_MINUTES} minutes`)
        }
    }
    if(endMin <= startMin) throw fail(400, 'A working day ends after it begins')
    if(breakMin >= endMin - startMin) throw fail(400, 'The break does not fit into the day')

    return {weekday, startMin, endMin, breakMin}
}

function cleanWeek(days){
    if(!Array.isArray(days)) throw fail(400, 'Give the days as a list')
    const clean = days.map(cleanDay)
    const seen = new Set()
    for(const day of clean){
        if(seen.has(day.weekday)) throw fail(400, 'A weekday appears twice')
        seen.add(day.weekday)
    }
    return clean.sort((a, b) => a.weekday - b.weekday)
}

/** How much working time one day carries. A free day carries none. */
function minutesOfDay(day){
    if(!day) return 0
    return Math.max(0, day.endMin - day.startMin - (day.breakMin || 0))
}

/**
 * The working minutes between two dates.
 *
 * Counted day by day rather than as "weeks × hours per week": a range is
 * almost never a whole number of weeks, and half a week of capacity is the
 * question people actually ask ("does the rest of this week fit").
 *
 * The window is taken as [from, to) in local time, which is the same time the
 * calendar grid draws.
 */
function availableMinutes(days, from, to){
    const byWeekday = new Map(days.map(d => [d.weekday, d]))
    let minutes = 0
    const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate())
    while(cursor < to){
        minutes += minutesOfDay(byWeekday.get(cursor.getDay()))
        cursor.setDate(cursor.getDate() + 1)
    }
    return minutes
}

/* ------------------------------------------------------------- reading -- */

async function forUser(userId){
    return await workHoursRepo.findForUser(userId)
}

async function forUsers(userIds){
    return await workHoursRepo.findForUsers(userIds)
}

async function save(userId, days){
    return await workHoursRepo.replaceForUser(userId, cleanWeek(days))
}

/**
 * A window, in four numbers.
 *
 * They are deliberately not combined into a percentage or a verdict. Planned,
 * recorded, estimated and available measure four different things, and the
 * one that matters depends on the question being asked — a screen that
 * reduces them to "87 % ausgelastet" has decided that question for everybody.
 */
async function summary(userId, from, to){
    const days = await workHoursRepo.findForUser(userId)
    const [planned, tracked, estimated] = await Promise.all([
        workHoursRepo.plannedMinutes(userId, from, to),
        workHoursRepo.trackedMinutes(userId, from, to),
        workHoursRepo.estimateMinutes(userId, from, to)
    ])
    return {
        availableMin: availableMinutes(days, from, to),
        plannedMin: planned,
        trackedMin: tracked,
        estimateMin: estimated
    }
}

module.exports = {
    forUser, forUsers, save, summary,
    // exported for the tests
    cleanDay, cleanWeek, minutesOfDay, availableMinutes, DAY_MINUTES
}
