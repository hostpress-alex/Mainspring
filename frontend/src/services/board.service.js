import { httpService } from './http.service.js'
import { userService } from './user.service.js'
import { utilService } from './util.service.js'
import { makeColumnId } from './column.service.js'
import { GUEST_IMG } from '../services/avatar'

const BASE_URL = 'board/'

export const boardService = {
    query,
    ownerIdsOf,
    isBoardOwner,
    canManageMembers,
    getById,
    getFilteredBoard,
    save,
    remove,
    getDefaultFilterBoard,
    getDefaultFilterBoards,
    getFilterFromSearchParams,
    getEmptyGroup,
    getEmptyTask,
    getEmptyComment,
    getEmptyActivity,
    getEmptyBoard,
    updateTask,
    updateGroup,

    // Gezielte Schreibvorgaenge
    updateMeta,
    setColumns,
    setMembers,
    setOwners,
    addGroup,
    patchGroup,
    replaceGroup,
    deleteGroup,
    reorderGroups,
    addTask,
    patchTask,
    replaceTask,
    deleteTask,
    reorderTasks,
    moveTask,
    addActivity
}

const sid = v => (v === undefined || v === null) ? '' : String(v)

/** Owner-Liste eines Boards, mit Rueckfall auf das alte Einzelfeld ownerId. */
function ownerIdsOf(board) {
    if (!board) return []
    if (Array.isArray(board.ownerIds)) return board.ownerIds.map(sid)
    if (board.ownerId) return [sid(board.ownerId)]
    return []
}

function isBoardOwner(board, user) {
    if (!board || !user) return false
    return ownerIdsOf(board).includes(sid(user._id))
}

/** Mitglieder und Owner aendern duerfen nur Board-Owner und Admins. */
function canManageMembers(board, user) {
    if (!user) return false
    if (user.isAdmin) return true
    return isBoardOwner(board, user)
}

function query(filter = getDefaultFilterBoards()) {
    const queryParams = `?title=${filter.title}&isStarred=${filter.isStarred}`
    return httpService.get(BASE_URL + queryParams)
}

/**
 * Gefilterte Sicht auf ein Board.
 *
 * Ohne aktiven Filter nur eine flache Kopie. Mit Filter wird tief kopiert:
 * frueher wurde hier group.tasks des ECHTEN Boards ueberschrieben, damit
 * verschwanden Tasks auch aus dem Original.
 */
function getFilteredBoard(board, filterBy = getDefaultFilterBoard()) {
    if (!board) return board
    const f = filterBy || getDefaultFilterBoard()
    if (!f.title && !f.memberId) return { ...board }

    const filteredBoard = structuredClone(board)
    if (f.title) {
        // Wie gehabt: die Gruppenliste bleibt vollstaendig, nur in Gruppen mit
        // passendem Titel werden die Tasks eingeschraenkt.
        const regex = new RegExp(f.title, 'i')
        ;(filteredBoard.groups || []).filter(group => regex.test(group.title)).forEach(group => {
            group.tasks = (group.tasks || []).filter(task => regex.test(task.title))
        })
    }
    if (f.memberId) {
        (filteredBoard.groups || []).forEach(group => {
            group.tasks = (group.tasks || []).filter(task => (task.memberIds || []).includes(f.memberId))
        })
    }
    return filteredBoard
}

function getById(boardId) {
    return httpService.get(BASE_URL + boardId)
}

function remove(boardId) {
    return httpService.delete(BASE_URL + boardId)
}

function save(board) {
    if (board._id) return httpService.put(BASE_URL + board._id, board)
    return httpService.post(BASE_URL, board)
}

function updateTask(boardId, groupId, task) {
    return httpService.put(`${BASE_URL}${boardId}/${groupId}/${task.id}`, task)
}

function updateGroup(boardId, group) {
    return httpService.put(`${BASE_URL}${boardId}/${group.id}`, group)
}

/* ======================================================================
 * Gezielte Schreibvorgaenge
 *
 * `save(board)` schreibt das GANZE Board. Arbeiten zwei Leute gleichzeitig
 * am selben Board, gewinnt der letzte Schreibvorgang und alles dazwischen
 * ist weg. Die Funktionen hier schicken nur das, was sich wirklich
 * geaendert hat, und bekommen das frische Board zurueck.
 *
 * Rueckgabe ist immer das komplette, aktuelle Board vom Server.
 * ==================================================================== */

/** Kopf-Daten des Boards: title, description, folder, isStarred, labels ... */
function updateMeta(boardId, patch) {
    return httpService.patch(`${BASE_URL}${boardId}`, patch)
}

function setColumns(boardId, columns) {
    return httpService.put(`${BASE_URL}${boardId}/columns`, { columns })
}

function setMembers(boardId, members) {
    return httpService.put(`${BASE_URL}${boardId}/members`, { members })
}

function setOwners(boardId, ownerIds) {
    return httpService.put(`${BASE_URL}${boardId}/owners`, { ownerIds })
}

/** index === null haengt die Gruppe hinten an. */
function addGroup(boardId, group, index = null) {
    return httpService.post(`${BASE_URL}${boardId}/group`, { group, index })
}

/** Nur einzelne Felder der Gruppe (Titel, Farbe) — Tasks bleiben unberuehrt. */
function patchGroup(boardId, groupId, patch) {
    return httpService.patch(`${BASE_URL}${boardId}/group/${groupId}`, patch)
}

/** Ganze Gruppe inkl. Tasks ersetzen. Nur benutzen, wenn sich mehrere Tasks
 *  einer Gruppe gleichzeitig aendern — sonst ist patchTask das Richtige. */
function replaceGroup(boardId, groupId, group) {
    return httpService.put(`${BASE_URL}${boardId}/group/${groupId}`, { group })
}

function deleteGroup(boardId, groupId) {
    return httpService.delete(`${BASE_URL}${boardId}/group/${groupId}`)
}

function reorderGroups(boardId, groupIds) {
    return httpService.put(`${BASE_URL}${boardId}/groups/order`, { groupIds })
}

function addTask(boardId, groupId, task, index = null) {
    return httpService.post(`${BASE_URL}${boardId}/group/${groupId}/task`, { task, index })
}

/** Der haeufigste Schreibvorgang: einzelne Felder eines Tasks.
 *  Zwei Leute koennen so gleichzeitig verschiedene Spalten desselben
 *  Tasks aendern, ohne sich zu ueberschreiben. */
function patchTask(boardId, groupId, taskId, patch) {
    return httpService.patch(`${BASE_URL}${boardId}/group/${groupId}/task/${taskId}`, patch)
}

function replaceTask(boardId, groupId, taskId, task) {
    return httpService.put(`${BASE_URL}${boardId}/group/${groupId}/task/${taskId}`, { task })
}

function deleteTask(boardId, groupId, taskId) {
    return httpService.delete(`${BASE_URL}${boardId}/group/${groupId}/task/${taskId}`)
}

function reorderTasks(boardId, groupId, taskIds) {
    return httpService.put(`${BASE_URL}${boardId}/group/${groupId}/tasks/order`, { taskIds })
}

function moveTask(boardId, taskId, fromGroupId, toGroupId, index = null) {
    return httpService.post(`${BASE_URL}${boardId}/task/${taskId}/move`,
        { fromGroupId, toGroupId, index })
}

function addActivity(boardId, activity) {
    return httpService.post(`${BASE_URL}${boardId}/activity`, { activity })
}

function getDefaultFilterBoards() {
    return {
        title: '',
        isStarred: false
    }
}

function getDefaultFilterBoard() {
    return {
            title: '',
            memberId: '' 
        }
}

function getFilterFromSearchParams(searchParams) {
    const emptyFilter = getDefaultFilterBoard()
    const filterBy = {}
    for (const field in emptyFilter) {
        filterBy[field] = searchParams.get(field) || ''
    }
    return filterBy
}

function getEmptyGroup() {
    return {
        "title": 'New Group',
        "archivedAt": Date.now(),
        "tasks": [],
        "color": '#ffcb00',
    }
}

function getEmptyTask() {
    return {
        "title": "",
        "status": "",
        "priority": "",
        "memberIds": [],
        "dueDate": '',
        "comments": [],
        "updatedBy":{
            "imgUrl":"",
        },
        "file": "",
    }
}

function getEmptyComment() {
    return {
        "archivedAt": Date.now(),
        "byMember": {
            "_id": null,
            "fullname": "Guest",
            "imgUrl": GUEST_IMG
        },
        // null = eigenstaendiges Update, sonst die Id des Updates, auf das
        // geantwortet wird. Bewusst nur eine Ebene tief.
        "parentId": null,
        "txt": "",
        "attachments": [],
        "style": {
            "textDecoration": "none",
            "fontWeight": "normal",
            "fontStyle": "normal",
            "textAlign": "Left"
        }
    }
}

function getEmptyActivity() {
    return {
        "action": "status",
        "createdAt": Date.now(),
        "byMember": userService.getLoggedinUser() || {
            "_id": null,
            "fullname": "Guest",
            "imgUrl": GUEST_IMG
        },
        "task": {
            "id": "c101",
            "title": "Replace Logo"
        },
        // null, nicht {}: from/to sind je nach Aktion Text, Zahl oder Label.
        // Ein leeres Objekt landete frueher in der Datenbank und liess die
        // Verlaufsanzeige beim Rendern auflaufen.
        "from": null,
        "to": null
    }
}

function getEmptyBoard() {
    return {
        "title": 'New Board',
        "folder": '',
        "archivedAt": Date.now(),
        "isStarred": false,
        "createdBy": userService.getLoggedinUser() || { "fullname": "Unbekannt", "imgUrl": "", "_id": "" },
        "labels": [
            {
                "id": "l101",
                "title": "Done",
                "color": "#00c875"
            },
            {
                "id": "l102",
                "title": "Progress",
                "color": "#fdab3d"
            },
            {
                "id": "l103",
                "title": "Stuck",
                "color": "#e2445c"
            },
            {
                "id": "l104",
                "title": "Low",
                "color": "#ffcb00"
            },
            {
                "id": "l105",
                "title": "Medium",
                "color": "#a25ddc"
            },
            {
                "id": "l106",
                "title": "High",
                "color": "#e2445c"
            },
            {
                "id": "l107",
                "title": "",
                "color": "#c4c4c4"
            },
        ],
        "members": [],
        "groups": [],
        "activities": [],
        "columns": [
            { id: makeColumnId(), type: 'status',   title: 'Status',   field: 'status' },
            { id: makeColumnId(), type: 'person',   title: 'Person',   field: 'memberIds' },
            { id: makeColumnId(), type: 'date',     title: 'Date',     field: 'dueDate' },
            { id: makeColumnId(), type: 'priority', title: 'Priority', field: 'priority' },
            { id: makeColumnId(), type: 'updated',  title: 'Zuletzt aktualisiert', field: 'updatedBy' },
        ],
        "cmpsOrder": ["status-picker", "member-picker", "date-picker", 'priority-picker', 'updated-picker'],
        "description": "",
        "cmpsOption": ["status-picker", "member-picker", "date-picker", 'priority-picker', 'number-picker', 'file-picker', 'updated-picker']
    }
}


