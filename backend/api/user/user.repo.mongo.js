/**
 * Storage access for users — MongoDB.
 * Counterpart: user.repo.sql.js. The pick happens in user.repo.js.
 */
const dbService = require('../../services/db.service')
const ObjectId = require('mongodb').ObjectId

const col = () => dbService.getCollection('user')

function toId(id) {
    try {
        return new ObjectId(String(id))
    } catch (err) {
        return null
    }
}

/** On the outside a user id is always a string. */
function out(doc) {
    if (!doc) return null
    const user = { ...doc, _id: String(doc._id) }
    if (!user.createdAt) {
        const oid = toId(doc._id)
        if (oid) user.createdAt = oid.getTimestamp()
    }
    return user
}

async function findAll() {
    const collection = await col()
    return (await collection.find({}).toArray()).map(out)
}

async function query(filterBy = {}) {
    const criteria = {}
    if (filterBy.txt) {
        const txt = { $regex: filterBy.txt, $options: 'i' }
        criteria.$or = [{ username: txt }, { fullname: txt }]
    }
    const collection = await col()
    return (await collection.find(criteria).toArray()).map(out)
}

async function findById(userId) {
    const id = toId(userId)
    if (!id) return null
    const collection = await col()
    return out(await collection.findOne({ _id: id }))
}

async function findByUsername(username) {
    const collection = await col()
    return out(await collection.findOne({ username }))
}

async function insert(user) {
    const collection = await col()
    const doc = { ...user }
    delete doc._id
    const res = await collection.insertOne(doc)
    return out({ ...doc, _id: res.insertedId })
}

async function updateFields(userId, patch) {
    const id = toId(userId)
    if (!id) return
    if (!patch || !Object.keys(patch).length) return
    const collection = await col()
    await collection.updateOne({ _id: id }, { $set: patch })
}

async function deleteById(userId) {
    const id = toId(userId)
    if (!id) return
    const collection = await col()
    await collection.deleteOne({ _id: id })
}

module.exports = { findAll, query, findById, findByUsername, insert, updateFields, deleteById }
