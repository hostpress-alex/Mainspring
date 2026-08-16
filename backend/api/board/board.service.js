const logger = require('../../services/logger.service')
const asyncLocalStorage = require('../../services/als.service')
const boardRepo = require('./board.repo')

/**
 * Loaded on use, not at the top.
 *
 * notification.service reaches socket.service, which reaches this file. A
 * plain require at the top would hand socket.service the exports object as it
 * looks halfway through loading — which is to say empty, because
 * module.exports is assigned at the bottom. require caches, so this costs a
 * lookup and nothing else.
 */
const notifications = () => require('../notification/notification.service')
const userRepo = require('../user/user.repo')

/** Wirft einen Fehler, den der Controller auf einen HTTP-Status abbilden kann. */
function httpError(status, msg){
    const err = new Error(msg)
    err.status = status
    return err
}

function getLoggedinUser(){
    const store = asyncLocalStorage.getStore()
    return (store && store.loggedinUser) || null
}

const sid = v => (v === undefined || v === null)?'':String(v)

/** Who owns a board. Ownership itself lives in board_member.is_owner. */
function ownerIdsOf(board){
    if(!board || !Array.isArray(board.ownerIds)) return []
    return board.ownerIds.map(sid)
}

function memberIdsOf(board){
    if(!board || !Array.isArray(board.members)) return []
    return board.members.filter(Boolean).map(m => sid(m._id))
}

/** Sehen und inhaltlich bearbeiten darf: Owner, Mitglied, Admin. */
function hasAccess(board, user){
    if(!user || !board) return false
    if(user.isAdmin) return true
    const uid = sid(user._id)
    return ownerIdsOf(board).includes(uid) || memberIdsOf(board).includes(uid)
}

/**
 * Verwalten darf: Owner und Admin. Verwalten heisst Mitglieder und Owner
 * aendern sowie das Board loeschen.
 */
function isOwner(board, user){
    if(!user || !board) return false
    if(user.isAdmin) return true
    return ownerIdsOf(board).includes(sid(user._id))
}

/**
 * board.members speichert Name und Bild redundant aus dem Moment der Einladung.
 * Damit ein geaendertes Profilbild ueberall sofort erscheint, werden diese
 * Felder beim Lesen aus der user-Collection aufgefrischt. Die Mitgliedschaft
 * selbst (die _id) bleibt unangetastet — sie ist die Rechtequelle.
 */
async function enrichMembers(boards){
    const list = Array.isArray(boards)?boards:[boards]
    const ids = new Set()
    for(const b of list) for(const m of (b.members || [])) if(m && m._id) ids.add(String(m._id))
    if(!ids.size) return boards

    const found = await userRepo.findAll()
    const byId = new Map(found.map(u => [String(u._id), u]))

    for(const b of list){
        b.members = (b.members || []).map(m => {
            const u = m && byId.get(String(m._id))
            if(!u) return m   // geloeschter Benutzer: gespeicherte Kopie behalten
            return {...m, fullname: u.fullname, imgUrl: u.imgUrl || ''}
        })
    }
    return boards
}

const COL_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

/* ----------------------------------------------------------------------
 * Label-Listen pro Spalte
 *
 * Frueher teilten sich Status und Prioritaet EINE Liste am Board. Im
 * Prioritaets-Menue stand deshalb auch "Done". Jetzt haengt die Auswahl an
 * der Spalte: column.labels.
 *
 * Fuer Boards von frueher wird die Liste einmal hergeleitet — aus den
 * Werten, die in dieser Spalte tatsaechlich vorkommen. Sobald eine Spalte
 * ihre eigene Liste hat, wird hier nichts mehr angefasst; ab dann bestimmt
 * der Benutzer, was drinsteht (auch das Loeschen eines Labels).
 * -------------------------------------------------------------------- */

const EMPTY_LABEL_COLOR = '#c4c4c4'

const DEFAULT_LABELS = {
    status: [
        {title: 'Done', color: '#00c875'},
        {title: 'Progress', color: '#fdab3d'},
        {title: 'Stuck', color: '#e2445c'}
    ],
    priority: [
        {title: 'Low', color: '#ffcb00'},
        {title: 'Medium', color: '#a25ddc'},
        {title: 'High', color: '#e2445c'}
    ]
}

/** Reservefarben fuer Werte, zu denen es kein Label mehr gibt. */
const SPARE_COLORS = ['#0086c0', '#579bfc', '#a25ddc', '#00c875', '#fdab3d', '#e2445c', '#ff642e']

function makeLabelId(){
    let id = 'lb_'
    for(let i = 0; i < 8; i++) id += COL_CHARS[Math.floor(Math.random() * COL_CHARS.length)]
    return id
}

function ensureColumnLabels(board){
    if(!board || !Array.isArray(board.columns)) return board
    const boardLabels = Array.isArray(board.labels)?board.labels:[]
    const byTitle = new Map(boardLabels.filter(l => l && l.title).map(l => [l.title, l]))

    for(const column of board.columns){
        if(!column || (column.type !== 'status' && column.type !== 'priority')) continue
        if(Array.isArray(column.labels)) continue

        const field = column.field || column.id
        const used = []
        const seen = new Set()
        for(const group of board.groups || []){
            for(const task of group.tasks || []){
                const value = task?task[field]:null
                if(typeof value !== 'string' || !value || seen.has(value)) continue
                seen.add(value)
                used.push(value)
            }
        }

        let source
        if(used.length){
            // Was wirklich benutzt wird, gewinnt — mit der bisherigen Farbe.
            source = used.map((title, i) => byTitle.get(title)
                || {title, color: SPARE_COLORS[i % SPARE_COLORS.length]})
        } else {
            // Leere Spalte: die passenden Eintraege der alten Board-Liste.
            const wanted = DEFAULT_LABELS[column.type].map(l => l.title)
            source = boardLabels.filter(l => l && wanted.includes(l.title))
            if(!source.length) source = DEFAULT_LABELS[column.type]
        }

        column.labels = source.map(l => ({
            id: l.id || makeLabelId(),
            title: l.title,
            color: l.color || SPARE_COLORS[0]
        }))
        // Ohne leeres Label liesse sich ein gesetzter Wert nie zuruecknehmen.
        const empty = boardLabels.find(l => l && !l.title)
        column.labels.push({
            id: (empty && empty.id) || makeLabelId(),
            title: '',
            color: (empty && empty.color) || EMPTY_LABEL_COLOR
        })
    }
    return board
}

async function query(filterBy = {}){
    const user = getLoggedinUser()
    try {
        const boards = await boardRepo.findForUser(user, filterBy)
        boards.forEach(ensureColumnLabels)
        return await enrichMembers(boards)
    } catch(err) {
        logger.error('cannot find boards', err)
        throw err
    }
}

/** Rohzugriff ohne Rechtepruefung — nur intern verwenden. */
async function _getByIdRaw(boardId){
    return await boardRepo.findById(boardId)
}

async function getById(boardId){
    const user = getLoggedinUser()
    try {
        const board = await _getByIdRaw(boardId)
        if(!board) throw httpError(404, 'Board not found')
        if(!hasAccess(board, user)) throw httpError(403, 'Kein Zugriff auf dieses Board')
        ensureColumnLabels(board)
        return await enrichMembers(board)
    } catch(err) {
        if(!err.status) logger.error(`while finding board ${boardId}`, err)
        throw err
    }
}

async function remove(boardId){
    const user = getLoggedinUser()
    try {
        const board = await _getByIdRaw(boardId)
        if(!board) throw httpError(404, 'Board not found')
        if(!isOwner(board, user)) throw httpError(403, 'Nur ein Owner darf dieses Board loeschen')

        await boardRepo.deleteById(boardId)
        return String(boardId)
    } catch(err) {
        if(!err.status) logger.error(`cannot remove board ${boardId}`, err)
        throw err
    }
}

async function add(board){
    const user = getLoggedinUser()
    try {
        if(!user) throw httpError(401, 'Not Authenticated')
        delete board._id
        const uid = sid(user._id)
        board.ownerIds = [uid]

        // Der Ersteller muss auch Mitglied sein, sonst taucht er nicht in der
        // Mitgliederliste des Boards auf.
        if(!Array.isArray(board.members)) board.members = []
        if(!memberIdsOf(board).includes(uid)){
            board.members.push({_id: uid, fullname: user.fullname, imgUrl: user.imgUrl || ''})
        }

        return await boardRepo.insert(board)
    } catch(err) {
        if(!err.status) logger.error('cannot insert board', err)
        throw err
    }
}

/* ======================================================================
 * Targeted writes
 *
 * Each of these touches only what actually changes and then hands back the
 * fresh board. That is what stops two people working on different parts of
 * the same board from overwriting each other.
 *
 * They replaced three whole-document writers — update(board),
 * updateTask(...) and updateGroup(...) — which read a board, applied one
 * change in memory and wrote the entire document back. See the note at the
 * bottom of board.routes.js for the HTTP routes that went with them.
 * ==================================================================== */

/** Board laden und Rechte pruefen. `owner: true` verlangt Owner oder Admin. */
async function _requireBoard(boardId, {owner = false} = {}){
    const user = getLoggedinUser()
    const board = await _getByIdRaw(boardId)
    if(!board) throw httpError(404, 'Board nicht gefunden')
    if(!hasAccess(board, user)) throw httpError(403, 'Kein Zugriff auf dieses Board')
    if(owner && !isOwner(board, user)) throw httpError(403, 'Das darf nur ein Owner dieses Boards')
    return board
}

function _findGroup(board, groupId){
    const group = (board.groups || []).find(g => g.id === groupId)
    if(!group) throw httpError(404, 'Gruppe nicht gefunden')
    return group
}

/**
 * A task of this group, top level or one below.
 *
 * Subtasks are found here on purpose. It means patching, replacing and
 * deleting a subtask goes through exactly the same routes as a task, with the
 * same permission check, instead of a second set that would have to be kept in
 * step with the first one forever.
 */
function _findTask(group, taskId){
    for(const task of group.tasks || []){
        if(task.id === taskId) return task
        const child = (task.subtasks || []).find(t => t.id === taskId)
        if(child) return child
    }
    throw httpError(404, 'Task nicht gefunden')
}

/** The task a subtask hangs off, or null for a top-level task. */
function _findParent(group, taskId){
    return (group.tasks || []).find(t => (t.subtasks || []).some(c => c.id === taskId)) || null
}

async function updateMeta(boardId, patch){
    await _requireBoard(boardId)
    await boardRepo.updateMeta(boardId, patch)
    return await getById(boardId)
}

/**
 * Spaltenliste des Boards.
 *
 * Bewusst fuer alle Mitglieder erlaubt, nicht nur fuer Owner — Spalten
 * anlegen und umbenennen war bisher jedem moeglich, und ein 403 an dieser
 * Stelle wuerde das fuer die meisten Leute kaputt machen. Das Sortieren der
 * Spalten ist in der Oberflaeche weiterhin auf Owner beschraenkt.
 */
async function setColumns(boardId, columns){
    await _requireBoard(boardId)
    if(!Array.isArray(columns)) throw httpError(400, 'columns muss eine Liste sein')
    await boardRepo.setColumns(boardId, columns)
    return await getById(boardId)
}

async function setMembers(boardId, members){
    const board = await _requireBoard(boardId, {owner: true})
    if(!Array.isArray(members)) throw httpError(400, 'members muss eine Liste sein')
    const memberIds = members.filter(Boolean).map(m => sid(m._id))
    const orphanOwners = ownerIdsOf(board).filter(id => !memberIds.includes(id))
    if(orphanOwners.length) throw httpError(400, 'Owner koennen nicht als Mitglied entfernt werden')
    await boardRepo.setMembers(boardId, members)
    await notifications().boardMembersChanged({board, members, actor: getLoggedinUser()})
    return await getById(boardId)
}

async function setOwners(boardId, ownerIds){
    const board = await _requireBoard(boardId, {owner: true})
    const wanted = (ownerIds || []).map(sid)
    if(!wanted.length) throw httpError(400, 'Ein Board braucht mindestens einen Owner')
    const memberIds = memberIdsOf(board)
    if(wanted.some(id => !memberIds.includes(id))){
        throw httpError(400, 'Owner muessen auch Mitglied des Boards sein')
    }
    await boardRepo.setOwners(boardId, wanted)
    return await getById(boardId)
}

async function addGroup(boardId, group, index = null){
    await _requireBoard(boardId)
    if(!group || !group.id) throw httpError(400, 'group.id fehlt')
    await boardRepo.addGroup(boardId, group, index)
    return await getById(boardId)
}

async function removeGroup(boardId, groupId){
    const board = await _requireBoard(boardId)
    _findGroup(board, groupId)
    await boardRepo.removeGroup(boardId, groupId)
    return await getById(boardId)
}

async function updateGroupMeta(boardId, groupId, patch){
    const board = await _requireBoard(boardId)
    _findGroup(board, groupId)
    await boardRepo.updateGroupMeta(boardId, groupId, patch)
    return await getById(boardId)
}

async function replaceGroup(boardId, groupId, group){
    const board = await _requireBoard(boardId)
    _findGroup(board, groupId)
    await boardRepo.replaceGroup(boardId, groupId, group)
    return await getById(boardId)
}

async function reorderGroups(boardId, groupIds){
    const board = await _requireBoard(boardId)
    const byId = new Map((board.groups || []).map(g => [g.id, g]))
    const next = (groupIds || []).map(id => byId.get(id)).filter(Boolean)
    if(next.length !== (board.groups || []).length){
        throw httpError(400, 'Die Gruppenliste stimmt nicht mit dem Board ueberein')
    }
    await boardRepo.reorderGroups(boardId, next)
    return await getById(boardId)
}

async function addTask(boardId, groupId, task, index = null){
    const board = await _requireBoard(boardId)
    _findGroup(board, groupId)
    if(!task || !task.id) throw httpError(400, 'task.id fehlt')
    await boardRepo.addTask(boardId, groupId, task, index)
    await notifications().taskAdded({board, groupId, task, actor: getLoggedinUser()})
    return await getById(boardId)
}

async function removeTask(boardId, groupId, taskId){
    const board = await _requireBoard(boardId)
    _findTask(_findGroup(board, groupId), taskId)
    await boardRepo.removeTask(boardId, groupId, taskId)
    return await getById(boardId)
}

/** Der haeufigste Schreibvorgang ueberhaupt: einzelne Felder eines Tasks. */
async function updateTaskFields(boardId, groupId, taskId, patch){
    const board = await _requireBoard(boardId)
    // Kept rather than discarded: the state before the write is what tells a
    // real change from a resend of the same value.
    const group = _findGroup(board, groupId)
    const oldTask = _findTask(group, taskId)
    const parent = _findParent(group, taskId)
    if(!patch || typeof patch !== 'object') throw httpError(400, 'Keine Aenderungen uebergeben')
    await boardRepo.updateTaskFields(boardId, groupId, taskId, patch)
    await notifications().taskPatched({
        board, groupId, oldTask, patch, parentId: parent?parent.id:null, actor: getLoggedinUser()})
    return await getById(boardId)
}

async function replaceTask(boardId, groupId, taskId, task){
    const board = await _requireBoard(boardId)
    const group = _findGroup(board, groupId)
    const oldTask = _findTask(group, taskId)
    const parent = _findParent(group, taskId)
    await boardRepo.replaceTask(boardId, groupId, taskId, {...task, id: taskId})
    // A whole-task write is a patch of everything, so the same comparison
    // works — otherwise this path would silently notify nobody.
    await notifications().taskPatched({
        board, groupId, oldTask, patch: task || {}, parentId: parent?parent.id:null, actor: getLoggedinUser()})
    return await getById(boardId)
}

/**
 * Add a subtask under a task.
 *
 * One level: the parent has to be a top-level task. The check lives here
 * rather than in the schema so this comes back as a readable 400 instead of a
 * constraint violation.
 */
async function addSubtask(boardId, groupId, parentId, subtask, index = null){
    const board = await _requireBoard(boardId)
    const group = _findGroup(board, groupId)
    const parent = _findTask(group, parentId)
    if(!parent.subtasks) throw httpError(400, 'Ein Subtask kann keine Subtasks haben')
    if(!subtask || !subtask.id) throw httpError(400, 'task.id fehlt')
    await boardRepo.addSubtask(boardId, parentId, subtask, index)
    await notifications().taskAdded({board, groupId, task: subtask, parentId, actor: getLoggedinUser()})
    return await getById(boardId)
}

async function reorderSubtasks(boardId, groupId, parentId, taskIds){
    const board = await _requireBoard(boardId)
    const parent = _findTask(_findGroup(board, groupId), parentId)
    const byId = new Map((parent.subtasks || []).map(t => [t.id, t]))
    const next = (taskIds || []).map(id => byId.get(id)).filter(Boolean)
    if(next.length !== (parent.subtasks || []).length){
        throw httpError(400, 'Die Subtaskliste stimmt nicht mit dem Task ueberein')
    }
    await boardRepo.setSubtasks(boardId, parentId, next)
    return await getById(boardId)
}

/**
 * Turn a task into a subtask of another, or a subtask back into a task.
 *
 * `parentId` null promotes. The rules are all about the one level:
 *
 *  - the new parent must itself be a top-level task,
 *  - a task cannot be put under itself,
 *  - and a task that has children of its own cannot become a child, because
 *    that would bury them at the second level.
 *
 * The last one is refused rather than quietly solved. Monday moves the
 * grandchildren up to the parent; doing that silently means somebody converts
 * one task and finds their structure rearranged. If it turns out to be wanted,
 * it should be a second, named action.
 */
async function setTaskParent(boardId, groupId, taskId, parentId = null, index = null){
    const board = await _requireBoard(boardId)
    const group = _findGroup(board, groupId)
    const task = _findTask(group, taskId)

    if(parentId){
        if(String(parentId) === String(taskId)){
            throw httpError(400, 'Ein Task kann nicht sich selbst untergeordnet werden')
        }
        if((task.subtasks || []).length){
            throw httpError(400, 'Dieser Task hat selbst Subtasks und kann keiner werden')
        }
        // The new parent may live in any group of this board — the task moves
        // into that group with it.
        const parent = (board.groups || [])
            .flatMap(g => g.tasks || []).find(t => t.id === parentId)
        if(!parent) throw httpError(404, 'Zieltask nicht gefunden')
        if(!parent.subtasks) throw httpError(400, 'Ein Subtask kann keine Subtasks haben')
    }

    await boardRepo.setTaskParent(boardId, taskId, parentId || null, index)
    return await getById(boardId)
}

async function reorderTasks(boardId, groupId, taskIds){
    const board = await _requireBoard(boardId)
    const group = _findGroup(board, groupId)
    const byId = new Map((group.tasks || []).map(t => [t.id, t]))
    const next = (taskIds || []).map(id => byId.get(id)).filter(Boolean)
    if(next.length !== (group.tasks || []).length){
        throw httpError(400, 'Die Taskliste stimmt nicht mit der Gruppe ueberein')
    }
    await boardRepo.setGroupTasks(boardId, groupId, next)
    return await getById(boardId)
}

async function moveTask(boardId, fromGroupId, toGroupId, taskId, index = null){
    const board = await _requireBoard(boardId)
    const from = _findGroup(board, fromGroupId)
    const task = _findTask(from, taskId)
    _findGroup(board, toGroupId)
    if(fromGroupId === toGroupId){
        return await reorderTasks(boardId, fromGroupId,
            (from.tasks || []).map(t => t.id))
    }
    await boardRepo.moveTask(boardId, fromGroupId, toGroupId, task, index)
    return await getById(boardId)
}

async function addActivity(boardId, activity){
    await _requireBoard(boardId)
    await boardRepo.addActivity(boardId, activity)
    return await getById(boardId)
}

module.exports = {
    remove,
    query,
    getById,
    add,
    hasAccess,
    isOwner,
    ownerIdsOf,
    enrichMembers,
    ensureColumnLabels,

    updateMeta,
    setColumns,
    setMembers,
    setOwners,
    addGroup,
    removeGroup,
    updateGroupMeta,
    replaceGroup,
    reorderGroups,
    addTask,
    addSubtask,
    reorderSubtasks,
    setTaskParent,
    removeTask,
    updateTaskFields,
    replaceTask,
    reorderTasks,
    moveTask,
    addActivity,

    // Exported so the tests can reach the tree walking without a database.
    _findTask,
    _findParent
}
