/**
 * Metadaten hochgeladener Dateien — MariaDB.
 * Gegenstueck: file.repo.mongo.js.
 *
 * Nach aussen sieht ein Eintrag genauso aus wie frueher das Mongo-Dokument,
 * damit file.service.js nichts davon merkt.
 */
const { db } = require('../db/knex')

function out(row) {
    if (!row) return null
    return {
        _id: row.id,
        relPath: row.rel_path,
        mime: row.mime,
        size: Number(row.size),
        scope: row.scope,
        originalName: row.original_name || '',
        taskId: row.task_id,
        uploadedBy: row.uploaded_by_id,
        uploadedByName: row.uploaded_by_name,
        createdAt: row.created_at,
    }
}

function toRow(doc) {
    return {
        id: doc._id,
        rel_path: doc.relPath,
        mime: doc.mime || '',
        size: Number(doc.size) || 0,
        scope: doc.scope || 'misc',
        original_name: doc.originalName || null,
        task_id: doc.taskId || null,
        uploaded_by_id: doc.uploadedBy || null,
        uploaded_by_name: doc.uploadedByName || null,
        created_at: doc.createdAt ? new Date(doc.createdAt) : new Date(),
    }
}

async function insert(doc) {
    await db()('file').insert(toRow(doc))
    return doc
}

async function findById(id) {
    return out(await db()('file').where({ id: String(id) }).first())
}

async function findAll() {
    return (await db()('file').orderBy('created_at')).map(out)
}

async function deleteById(id) {
    await db()('file').where({ id: String(id) }).del()
}

module.exports = { insert, findById, findAll, deleteById }
