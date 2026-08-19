/**
 * Storage access for the link to an outside calendar, and for the copy of
 * what was found there.
 */
const {db} = require('../../db/knex')

const sid = v => (v === undefined || v === null)?'':String(v)

function linkOut(row){
    if(!row) return null
    return {
        userId: row.user_id,
        provider: row.provider,
        externalEmail: row.external_email || '',
        isEnabled: Boolean(row.is_enabled),
        lastSyncAt: row.last_sync_at === null || row.last_sync_at === undefined?null:Number(row.last_sync_at),
        lastError: row.last_error || null
    }
}

function eventOut(row){
    if(!row) return null
    return {
        id: row.provider + ':' + row.external_id,
        externalId: row.external_id,
        source: row.provider,
        title: row.title || '',
        start: new Date(row.start_at).getTime(),
        end: new Date(row.end_at).getTime(),
        isAllDay: Boolean(row.is_all_day),
        status: row.status || 'confirmed'
    }
}

/* ---------------------------------------------------------------- link -- */

async function findLink(userId){
    return linkOut(await db()('calendar_link').where({user_id: sid(userId)}).first())
}

async function allLinks({onlyEnabled = false} = {}){
    let q = db()('calendar_link')
    if(onlyEnabled) q = q.where({is_enabled: true})
    return (await q).map(linkOut)
}

async function saveLink(userId, {externalEmail, isEnabled = true, provider = 'google'}){
    const row = {
        user_id: sid(userId), provider, external_email: externalEmail,
        is_enabled: isEnabled, created_at: Date.now()
    }
    await db()('calendar_link').insert(row)
        .onConflict('user_id').merge(['provider', 'external_email', 'is_enabled'])
    return await findLink(userId)
}

async function removeLink(userId){
    await db().transaction(async trx => {
        await trx('calendar_link').where({user_id: sid(userId)}).del()
        // The mirror goes with it. Keeping events of a calendar nobody reads
        // any more would leave entries on screen that can never change again.
        await trx('external_event').where({user_id: sid(userId)}).del()
    })
}

async function noteSync(userId, {at = Date.now(), error = null} = {}){
    await db()('calendar_link').where({user_id: sid(userId)})
        .update({last_sync_at: at, last_error: error?String(error).slice(0, 500):null})
}

/* -------------------------------------------------------------- events -- */

async function findEvents(userId, from, to){
    const rows = await db()('external_event')
        .where({user_id: sid(userId)})
        .where('start_at', '<', to).where('end_at', '>', from)
        .orderBy('start_at', 'asc')
    return rows.map(eventOut)
}

/**
 * Write what came back, and remove what did not.
 *
 * The window is the unit: everything this person has in that window is
 * replaced by what Google just said is in it. That is what makes a deleted
 * appointment disappear even if Google never mentioned the deletion — and it
 * is why the window has to be the same one that was fetched.
 *
 * Inside one transaction, so a failed sync leaves the previous copy intact
 * rather than half of two.
 */
async function replaceWindow(userId, from, to, events, provider = 'google'){
    await db().transaction(async trx => {
        await trx('external_event')
            .where({user_id: sid(userId), provider})
            .where('start_at', '<', to).where('end_at', '>', from)
            .del()

        if(!events.length) return
        await trx('external_event').insert(events.map(e => ({
            user_id: sid(userId),
            provider,
            external_id: String(e.externalId).slice(0, 190),
            calendar_id: e.calendarId || '',
            title: e.title || '',
            start_at: e.startAt,
            end_at: e.endAt,
            is_all_day: Boolean(e.isAllDay),
            status: e.status || 'confirmed',
            updated_at: Date.now()
        })))
    })
    return events.length
}

module.exports = {
    findLink, allLinks, saveLink, removeLink, noteSync,
    findEvents, replaceWindow
}
