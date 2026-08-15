/**
 * Metadaten hochgeladener Dateien — MongoDB.
 * Gegenstueck: file.repo.sql.js.
 */
const dbService = require('./db.service')

const col = () => dbService.getCollection('file')

async function insert(doc) {
    const collection = await col()
    await collection.insertOne(doc)
    return doc
}

async function findById(id) {
    const collection = await col()
    return await collection.findOne({ _id: id })
}

async function deleteById(id) {
    const collection = await col()
    await collection.deleteOne({ _id: id })
}

module.exports = { insert, findById, deleteById }
