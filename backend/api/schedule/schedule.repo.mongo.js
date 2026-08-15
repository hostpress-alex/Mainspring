/**
 * Speicherzugriff auf Kalendereintraege — MongoDB.
 * Gegenstueck: schedule.repo.sql.js.
 */
const dbService = require('../../services/db.service')
const ObjectId = require('mongodb').ObjectId

const col = () => dbService.getCollection('schedule')

function toId(id) {
    try {
        return new ObjectId(String(id))
    } catch (err) {
        return null
    }
}

const out = doc => doc ? { ...doc, _id: String(doc._id) } : null

/** Eintraege eines Benutzers, die den Zeitraum beruehren. */
async function findForUser(userId, { from, to } = {}) {
    const criteria = { userId: String(userId) }
    // Ueberlappung statt Enthaltensein: ein Eintrag, der in die Woche
    // hineinragt, muss mitkommen.
    if (to) criteria.start = { $lt: to }
    if (from) criteria.end = { $gt: from }

    const collection = await col()
    const entries = await collection.find(criteria).toArray()
    entries.sort((a, b) => new Date(a.start) - new Date(b.start))
    return entries.map(out)
}

async function findById(id) {
    const oid = toId(id)
    if (!oid) return null
    const collection = await col()
    return out(await collection.findOne({ _id: oid }))
}

async function insert(entry) {
    const collection = await col()
    const doc = { ...entry }
    delete doc._id
    const res = await collection.insertOne(doc)
    return out({ ...doc, _id: res.insertedId })
}

async function replace(id, entry) {
    const oid = toId(id)
    if (!oid) return null
    const collection = await col()
    const doc = { ...entry }
    delete doc._id
    await collection.updateOne({ _id: oid }, { $set: doc })
    return out({ ...doc, _id: oid })
}

async function deleteById(id) {
    const oid = toId(id)
    if (!oid) return
    const collection = await col()
    await collection.deleteOne({ _id: oid })
}

module.exports = { findForUser, findById, insert, replace, deleteById }
