import {httpService} from './http.service.js'
import {userService} from './user.service.js'
import {utilService} from './util.service.js'
import {makeColumnId} from './column.service.js'
import {GUEST_IMG} from '../services/avatar'

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

const sid = v => (v === undefined || v === null)?'':String(v)

/** Owner list of a board, with a fallback to the old single field ownerId. */
function ownerIdsOf(board){
    if(!board) return []
    if(Array.isArray(board.ownerIds)) return board.ownerIds.map(sid)
    if(board.ownerId) return [sid(board.ownerId)]
    return []
}

function isBoardOwner(board, user){
    if(!board || !user) return false
    return ownerIdsOf(board).includes(sid(user._id))
}

/** Only board owners and admins may change members and owners. */
function canManageMembers(board, user){
    if(!user) return false
    if(user.isAdmin) return true
    return isBoardOwner(board, user)
}

function query(filter = getDefaultFilterBoards()){
    const queryParams = `?title=${filter.title}&isStarred=${filter.isStarred}`
    return httpService.get(BASE_URL + queryParams)
}

/**
 * Filtered view of a board.
 *
 * With no active filter just a shallow copy. With a filter it is deep-copied:
 * this used to overwrite group.tasks of the REAL board, so tasks vanished
 * from the original as well.
 */
/** A search term is text, not a pattern — `Preis (netto)` must not throw. */
function escapeForRegex(text){
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The board as the search leaves it. Never mutates the board it is given.
 *
 * A group survives if its own title matches — then it keeps all its tasks,
 * because searching for "Concept" is a way of asking for that whole group —
 * or if at least one task in it matches. Everything else drops out.
 *
 * This used to narrow the tasks only inside groups whose GROUP title matched,
 * which meant that searching for a task title filtered nothing at all: no
 * group is called after a task.
 */
function getFilteredBoard(board, filterBy = getDefaultFilterBoard()){
    if(!board) return board
    const f = filterBy || getDefaultFilterBoard()
    if(!f.title && !f.memberId) return {...board}

    const filteredBoard = structuredClone(board)
    let groups = filteredBoard.groups || []

    if(f.memberId){
        groups.forEach(group => {
            group.tasks = (group.tasks || []).filter(task => (task.memberIds || []).includes(f.memberId))
        })
    }

    if(f.title){
        const regex = new RegExp(escapeForRegex(f.title.trim()), 'i')
        groups = groups.filter(group => {
            if(regex.test(group.title || '')) return true
            group.tasks = (group.tasks || []).filter(task => regex.test(task.title || ''))
            return group.tasks.length > 0
        })
    }

    filteredBoard.groups = groups
    return filteredBoard
}

function getById(boardId){
    return httpService.get(BASE_URL + boardId)
}

function remove(boardId){
    return httpService.delete(BASE_URL + boardId)
}

function save(board){
    if(board._id) return httpService.put(BASE_URL + board._id, board)
    return httpService.post(BASE_URL, board)
}

function updateTask(boardId, groupId, task){
    return httpService.put(`${BASE_URL}${boardId}/${groupId}/${task.id}`, task)
}

function updateGroup(boardId, group){
    return httpService.put(`${BASE_URL}${boardId}/${group.id}`, group)
}

/* ======================================================================
 * Targeted writes
 *
 * `save(board)` writes the WHOLE board. If two people work on the same board
 * at the same time, the last write wins and everything in between is gone.
 * The functions here send only what has really changed, and get the fresh
 * board back.
 *
 * The return value is always the complete, current board from the server.
 * ==================================================================== */

/** Header data of the board: title, description, folder, isStarred, labels ... */
function updateMeta(boardId, patch){
    return httpService.patch(`${BASE_URL}${boardId}`, patch)
}

function setColumns(boardId, columns){
    return httpService.put(`${BASE_URL}${boardId}/columns`, {columns})
}

function setMembers(boardId, members){
    return httpService.put(`${BASE_URL}${boardId}/members`, {members})
}

function setOwners(boardId, ownerIds){
    return httpService.put(`${BASE_URL}${boardId}/owners`, {ownerIds})
}

/** index === null appends the group at the end. */
function addGroup(boardId, group, index = null){
    return httpService.post(`${BASE_URL}${boardId}/group`, {group, index})
}

/** Only single fields of the group (title, color) — tasks stay untouched. */
function patchGroup(boardId, groupId, patch){
    return httpService.patch(`${BASE_URL}${boardId}/group/${groupId}`, patch)
}

/** Replace a whole group including its tasks. Only use this when several tasks
 *  of one group change at the same time — otherwise patchTask is the right one. */
function replaceGroup(boardId, groupId, group){
    return httpService.put(`${BASE_URL}${boardId}/group/${groupId}`, {group})
}

function deleteGroup(boardId, groupId){
    return httpService.delete(`${BASE_URL}${boardId}/group/${groupId}`)
}

function reorderGroups(boardId, groupIds){
    return httpService.put(`${BASE_URL}${boardId}/groups/order`, {groupIds})
}

function addTask(boardId, groupId, task, index = null){
    return httpService.post(`${BASE_URL}${boardId}/group/${groupId}/task`, {task, index})
}

/** The most common write: single fields of a task.
 *  This way two people can change different columns of the same task at
 *  the same time without overwriting each other. */
function patchTask(boardId, groupId, taskId, patch){
    return httpService.patch(`${BASE_URL}${boardId}/group/${groupId}/task/${taskId}`, patch)
}

function replaceTask(boardId, groupId, taskId, task){
    return httpService.put(`${BASE_URL}${boardId}/group/${groupId}/task/${taskId}`, {task})
}

function deleteTask(boardId, groupId, taskId){
    return httpService.delete(`${BASE_URL}${boardId}/group/${groupId}/task/${taskId}`)
}

function reorderTasks(boardId, groupId, taskIds){
    return httpService.put(`${BASE_URL}${boardId}/group/${groupId}/tasks/order`, {taskIds})
}

function moveTask(boardId, taskId, fromGroupId, toGroupId, index = null){
    return httpService.post(`${BASE_URL}${boardId}/task/${taskId}/move`,
        {fromGroupId, toGroupId, index})
}

function addActivity(boardId, activity){
    return httpService.post(`${BASE_URL}${boardId}/activity`, {activity})
}

function getDefaultFilterBoards(){
    return {
        title: '',
        isStarred: false
    }
}

function getDefaultFilterBoard(){
    return {
        title: '',
        memberId: ''
    }
}

function getFilterFromSearchParams(searchParams){
    const emptyFilter = getDefaultFilterBoard()
    const filterBy = {}
    for(const field in emptyFilter){
        filterBy[field] = searchParams.get(field) || ''
    }
    return filterBy
}

function getEmptyGroup(){
    return {
        'title': 'New Group',
        'archivedAt': Date.now(),
        'tasks': [],
        'color': '#ffcb00'
    }
}

function getEmptyTask(){
    return {
        'title': '',
        'status': '',
        'priority': '',
        'memberIds': [],
        'dueDate': '',
        'comments': [],
        'updatedBy': {
            'imgUrl': ''
        },
        'file': ''
    }
}

function getEmptyComment(){
    return {
        'archivedAt': Date.now(),
        'byMember': {
            '_id': null,
            'fullname': 'Guest',
            'imgUrl': GUEST_IMG
        },
        // null = standalone update, otherwise the id of the update being
        // replied to. Deliberately only one level deep.
        'parentId': null,
        'txt': '',
        'attachments': [],
        'style': {
            'textDecoration': 'none',
            'fontWeight': 'normal',
            'fontStyle': 'normal',
            'textAlign': 'Left'
        }
    }
}

function getEmptyActivity(){
    return {
        'action': 'status',
        'createdAt': Date.now(),
        'byMember': userService.getLoggedinUser() || {
            '_id': null,
            'fullname': 'Guest',
            'imgUrl': GUEST_IMG
        },
        'task': {
            'id': 'c101',
            'title': 'Replace Logo'
        },
        // null, not {}: from/to are text, number or label depending on the action.
        // An empty object used to end up in the database and made the
        // history view blow up while rendering.
        'from': null,
        'to': null
    }
}

function getEmptyBoard(){
    return {
        'title': 'New Board',
        'folder': '',
        'archivedAt': Date.now(),
        'isStarred': false,
        'createdBy': userService.getLoggedinUser() || {'fullname': 'Unbekannt', 'imgUrl': '', '_id': ''},
        'labels': [
            {
                'id': 'l101',
                'title': 'Done',
                'color': '#00c875'
            },
            {
                'id': 'l102',
                'title': 'Progress',
                'color': '#fdab3d'
            },
            {
                'id': 'l103',
                'title': 'Stuck',
                'color': '#e2445c'
            },
            {
                'id': 'l104',
                'title': 'Low',
                'color': '#ffcb00'
            },
            {
                'id': 'l105',
                'title': 'Medium',
                'color': '#a25ddc'
            },
            {
                'id': 'l106',
                'title': 'High',
                'color': '#e2445c'
            },
            {
                'id': 'l107',
                'title': '',
                'color': '#c4c4c4'
            }
        ],
        'members': [],
        'groups': [],
        'activities': [],
        'columns': [
            {id: makeColumnId(), type: 'status', title: 'Status', field: 'status'},
            {id: makeColumnId(), type: 'person', title: 'Person', field: 'memberIds'},
            {id: makeColumnId(), type: 'date', title: 'Date', field: 'dueDate'},
            {id: makeColumnId(), type: 'priority', title: 'Priority', field: 'priority'},
            {id: makeColumnId(), type: 'updated', title: 'Zuletzt aktualisiert', field: 'updatedBy'}
        ],
        'cmpsOrder': ['status-picker', 'member-picker', 'date-picker', 'priority-picker', 'updated-picker'],
        'description': '',
        'cmpsOption': ['status-picker', 'member-picker', 'date-picker', 'priority-picker', 'number-picker', 'file-picker', 'updated-picker']
    }
}


