/**
 * Speicherzugriff auf Boards — die einzige Stelle, die weiss, wie ein Board
 * abgelegt ist.
 *
 * Zweck: Schreibvorgaenge sind **gezielt**. Frueher lief jede Aenderung ueber
 * "ganzes Board-Dokument zurueckschreiben"; arbeiteten zwei Leute gleichzeitig
 * am selben Board, ueberschrieb der spaetere Schreibvorgang alles vom frueheren.
 * Hier wird nur noch das angefasste Feld, der angefasste Task oder die
 * angefasste Gruppe geschrieben.
 *
 * Dies ist die MongoDB-Umsetzung. Die Gegenstueck-Datei board.repo.sql.js
 * macht dasselbe fuer MariaDB; board.repo.js waehlt anhand von DB_DRIVER aus.
 * Wer hier etwas ergaenzt, muss es dort ebenfalls ergaenzen.
 */
const dbService = require('../../services/db.service')
const ObjectId = require('mongodb').ObjectId

const COLLECTION = 'board'

function httpError(status, msg) {
    const err = new Error(msg)
    err.status = status
    return err
}

function toId(id) {
    try {
        return new ObjectId(String(id))
    } catch (err) {
        throw httpError(404, 'Board nicht gefunden')
    }
}

const col = () => dbService.getCollection(COLLECTION)

/** Filter fuer "diese Gruppe" bzw. "dieser Task" — Basis aller Teiloperationen. */
const groupFilter = groupId => ({ 'g.id': groupId })
const taskFilter = taskId => ({ 't.id': taskId })

async function applyOne(boardId, update, options = {}) {
    const collection = await col()
    const res = await collection.updateOne({ _id: toId(boardId) }, update, options)
    if (!res.matchedCount) throw httpError(404, 'Board nicht gefunden')
    return res
}

/* ---------------------------------------------------------------- Lesen -- */

async function findById(boardId) {
    const collection = await col()
    return await collection.findOne({ _id: toId(boardId) })
}

/** Die Boards, die dieser Benutzer sehen darf. */
async function findForUser(user, filterBy = {}) {
    if (!user) return []
    const uid = String(user._id)
    const criteria = user.isAdmin ? {} : {
        $or: [
            { ownerIds: uid },        // Array-Match
            { ownerId: uid },         // Altbestand: einzelnes Feld
            { 'members._id': uid },
        ],
    }
    if (filterBy.title) criteria.title = { $regex: filterBy.title, $options: 'i' }
    if (filterBy.isStarred) criteria.isStarred = filterBy.isStarred

    const collection = await col()
    return await collection.find(criteria).toArray()
}

/* --------------------------------------------------------------- Board --- */

async function insert(board) {
    const collection = await col()
    const res = await collection.insertOne(board)
    return { ...board, _id: res.insertedId }
}

async function deleteById(boardId) {
    const collection = await col()
    const res = await collection.deleteOne({ _id: toId(boardId) })
    if (!res.deletedCount) throw httpError(404, 'Board nicht gefunden')
    return String(boardId)
}

/** Nur die uebergebenen Kopfdaten schreiben — nie das ganze Dokument. */
const BOARD_META_FIELDS = ['title', 'description', 'folder', 'isStarred', 'archivedAt']

async function updateMeta(boardId, patch) {
    const $set = {}
    for (const key of BOARD_META_FIELDS) {
        if (patch[key] !== undefined) $set[key] = patch[key]
    }
    if (!Object.keys($set).length) return
    await applyOne(boardId, { $set })
}

async function setColumns(boardId, columns) {
    await applyOne(boardId, { $set: { columns }, $unset: { ownerId: '' } })
}

async function setMembers(boardId, members) {
    await applyOne(boardId, { $set: { members } })
}

async function setOwners(boardId, ownerIds) {
    await applyOne(boardId, { $set: { ownerIds }, $unset: { ownerId: '' } })
}

/* -------------------------------------------------------------- Gruppen -- */

async function addGroup(boardId, group, index = null) {
    const update = index === null
        ? { $push: { groups: group } }
        : { $push: { groups: { $each: [group], $position: index } } }
    await applyOne(boardId, update)
}

async function removeGroup(boardId, groupId) {
    await applyOne(boardId, { $pull: { groups: { id: groupId } } })
}

/** Titel oder Farbe einer Gruppe — Tasks bleiben unangetastet. */
const GROUP_META_FIELDS = ['title', 'color', 'archivedAt']

async function updateGroupMeta(boardId, groupId, patch) {
    const $set = {}
    for (const key of GROUP_META_FIELDS) {
        if (patch[key] !== undefined) $set[`groups.$[g].${key}`] = patch[key]
    }
    if (!Object.keys($set).length) return
    await applyOne(boardId, { $set }, { arrayFilters: [groupFilter(groupId)] })
}

/**
 * Eine komplette Gruppe ersetzen. Deutlich enger als "ganzes Board", und der
 * Ruecksprung fuer Ablaeufe, die mehrere Tasks einer Gruppe auf einmal aendern
 * (Drag & Drop, Mehrfachauswahl).
 */
async function replaceGroup(boardId, groupId, group) {
    await applyOne(boardId,
        { $set: { 'groups.$[g]': { ...group, id: groupId } } },
        { arrayFilters: [groupFilter(groupId)] })
}

/** Reihenfolge der Gruppen — schreibt nur das Gruppen-Array. */
async function reorderGroups(boardId, groups) {
    await applyOne(boardId, { $set: { groups } })
}

/* ---------------------------------------------------------------- Tasks -- */

async function addTask(boardId, groupId, task, index = null) {
    const value = index === null
        ? { 'groups.$[g].tasks': task }
        : { 'groups.$[g].tasks': { $each: [task], $position: index } }
    await applyOne(boardId, { $push: value }, { arrayFilters: [groupFilter(groupId)] })
}

async function removeTask(boardId, groupId, taskId) {
    await applyOne(boardId,
        { $pull: { 'groups.$[g].tasks': { id: taskId } } },
        { arrayFilters: [groupFilter(groupId)] })
}

/**
 * Einzelne Felder eines Tasks setzen. Genau hier lag der Kern des Problems:
 * ein Statuswechsel schrieb frueher das komplette Board.
 */
async function updateTaskFields(boardId, groupId, taskId, patch) {
    const $set = {}
    for (const [key, value] of Object.entries(patch || {})) {
        if (key === 'id') continue
        $set[`groups.$[g].tasks.$[t].${key}`] = value
    }
    if (!Object.keys($set).length) return
    await applyOne(boardId, { $set },
        { arrayFilters: [groupFilter(groupId), taskFilter(taskId)] })
}

/** Kompletten Task ersetzen (z.B. nach dem Bearbeiten im Dialog). */
async function replaceTask(boardId, groupId, taskId, task) {
    await applyOne(boardId,
        { $set: { 'groups.$[g].tasks.$[t]': task } },
        { arrayFilters: [groupFilter(groupId), taskFilter(taskId)] })
}

/** Reihenfolge innerhalb einer Gruppe — beruehrt nur diese eine Gruppe. */
async function setGroupTasks(boardId, groupId, tasks) {
    await applyOne(boardId,
        { $set: { 'groups.$[g].tasks': tasks } },
        { arrayFilters: [groupFilter(groupId)] })
}

/**
 * Task in eine andere Gruppe verschieben.
 *
 * Bewusst erst einfuegen, dann entfernen: bricht der zweite Schritt ab, gibt es
 * den Task doppelt (reparierbar) statt gar nicht (verloren). Ohne Replica Set
 * stehen in MongoDB keine Transaktionen zur Verfuegung.
 */
async function moveTask(boardId, fromGroupId, toGroupId, task, index = null) {
    await addTask(boardId, toGroupId, task, index)
    await removeTask(boardId, fromGroupId, task.id)
}

/* ------------------------------------------------------------ Aktivitaet -- */

const MAX_ACTIVITIES = 40

async function addActivity(boardId, activity) {
    await applyOne(boardId, {
        $push: { activities: { $each: [activity], $position: 0, $slice: MAX_ACTIVITIES } },
    })
}

module.exports = {
    findById, findForUser, insert, deleteById,
    updateMeta, setColumns, setMembers, setOwners,
    addGroup, removeGroup, updateGroupMeta, replaceGroup, reorderGroups,
    addTask, removeTask, updateTaskFields, replaceTask, setGroupTasks, moveTask,
    addActivity,
    MAX_ACTIVITIES,
}
