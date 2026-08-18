import {httpService} from './http.service.js'
import {hasRules, matchesTask, MODE_ALL, MODE_ANY} from './board-filter'
import * as boardRoles from './board-roles'
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
    canManageBoard,
    getViews,
    addView,
    updateView,
    removeView,
    setBoardState,
    setGroupState,
    setTaskState,
    getBin,
    getBoardsInState,
    purgeBoard,
    purgeGroup,
    purgeTask,
    setMemberRole,
    getById,
    getFilteredBoard,
    save,
    remove,
    getDefaultFilterBoard,
    getDefaultFilterBoards,
    getFilterFromSearchParams,
    loadFilter,
    saveFilter,
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
    addSubtask,
    setTaskParent,
    reorderSubtasks,
    patchTask,
    replaceTask,
    deleteTask,
    reorderTasks,
    moveTask,
    addActivity
}

const sid = v => (v === undefined || v === null)?'':String(v)

/** Owner list of a board. The server builds it from board_member.is_owner. */
function ownerIdsOf(board){
    if(!board || !Array.isArray(board.ownerIds)) return []
    return board.ownerIds.map(sid)
}

function isBoardOwner(board, user){
    if(!board || !user) return false
    return ownerIdsOf(board).includes(sid(user._id))
}

/**
 * All of these live in services/board-roles.js now, next to each other, and
 * are re-exported here because that is where the rest of the application has
 * always asked. The rules themselves are a copy of the server's — see the note
 * at the top of that file for why the copy is deliberate.
 */
/*
 * Function declarations, not `const` arrows — and this is not style. The
 * exported `boardService` object at the top of this file names them, and that
 * object is built the moment the module is evaluated. A declaration is
 * hoisted; a `const` is not, so writing these as arrows made the import throw
 * "cannot access before initialization" and the whole application rendered a
 * white page. Everything else in that object is a declaration for the same
 * reason.
 */
function canManageMembers(board, user){
    return boardRoles.isOwner(board, user)
}

function canManageBoard(board, user){
    return boardRoles.isOwner(board, user)
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
    const rules = f.rules || []
    if(!f.title && !f.memberId && !hasRules(rules)) return {...board}

    const filteredBoard = structuredClone(board)
    let groups = filteredBoard.groups || []

    // The rules from the filter panel, before the quick search below. That
    // order matters: a group whose TITLE matches the search keeps all of its
    // tasks, which would put back exactly what a rule had just removed.
    if(hasRules(rules)){
        const columns = filteredBoard.columns || []
        groups.forEach(group => {
            group.tasks = (group.tasks || []).filter(task =>
                matchesTask(task, rules, f.mode, {group, columns}))
        })
        groups = groups.filter(group => (group.tasks || []).length > 0)
    }

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

/* ------------------------------------------ Gespeicherte Filter -- */

/** The saved filters of a board. Everybody on it sees all of them. */
function getViews(boardId){
    return httpService.get(`${BASE_URL}${boardId}/view`)
}

function addView(boardId, view){
    return httpService.post(`${BASE_URL}${boardId}/view`, view)
}

function updateView(boardId, viewId, patch){
    return httpService.put(`${BASE_URL}${boardId}/view/${viewId}`, patch)
}

function removeView(boardId, viewId){
    return httpService.delete(`${BASE_URL}${boardId}/view/${viewId}`)
}

/* ------------------------------------------ Papierkorb und Archiv -- */

/**
 * Move a board, a group or a task between active, archived and trashed.
 *
 * "Delete" everywhere else in the app already goes here — the server turns it
 * into `trashed`. These are for the other direction and for the archive.
 */
function setBoardState(boardId, state){
    return httpService.put(`${BASE_URL}${boardId}/state`, {state})
}

function setGroupState(boardId, groupId, state){
    return httpService.put(`${BASE_URL}${boardId}/group/${groupId}/state`, {state})
}

function setTaskState(boardId, taskId, state){
    return httpService.put(`${BASE_URL}${boardId}/task/${taskId}/state`, {state})
}

/** The groups and tasks of one board in one of the two bins. */
function getBin(boardId, state){
    return httpService.get(`${BASE_URL}${boardId}/bin?state=${state}`)
}

/** The whole boards in one of the two bins. */
function getBoardsInState(state){
    return httpService.get(`${BASE_URL}bin/boards?state=${state}`)
}

/*
 * Gone for good. Owner only, and there is no way back from here.
 *
 * Declarations, not `const` arrows. The exported object at the top of this
 * file names these, and a const is not hoisted — the module would throw on
 * import before a single line of the app had run. That mistake has cost this
 * project two white pages already.
 */
function purgeBoard(boardId){
    return httpService.delete(`${BASE_URL}${boardId}/purge`)
}

function purgeGroup(boardId, groupId){
    return httpService.delete(`${BASE_URL}${boardId}/group/${groupId}/purge`)
}

function purgeTask(boardId, taskId){
    return httpService.delete(`${BASE_URL}${boardId}/task/${taskId}/purge`)
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

/**
 * A subtask is created and reordered through routes of its own; changing and
 * deleting one goes through patchTask/deleteTask like any task, because the
 * server finds a subtask there too.
 */
function addSubtask(boardId, groupId, parentId, task, index = null){
    return httpService.post(`${BASE_URL}${boardId}/group/${groupId}/task/${parentId}/subtask`, {task, index})
}

/** Hang a task under another one; parentId null takes it back out. */
/** One person's role on this board. */
function setMemberRole(boardId, userId, role){
    return httpService.put(`${BASE_URL}${boardId}/member/${userId}/role`, {role})
}

function setTaskParent(boardId, groupId, taskId, parentId, index = null){
    return httpService.put(`${BASE_URL}${boardId}/group/${groupId}/task/${taskId}/parent`, {parentId, index})
}

function reorderSubtasks(boardId, groupId, parentId, taskIds){
    return httpService.put(`${BASE_URL}${boardId}/group/${groupId}/task/${parentId}/subtasks/order`, {taskIds})
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
        // The two quick filters in the toolbar.
        title: '',
        memberId: '',
        // The rules from the filter panel, and whether all of them have to
        // match or just one. See services/board-filter.js.
        rules: [],
        mode: MODE_ALL
    }
}

/**
 * The two quick filters, from the URL.
 *
 * Only those two. The rules are objects, and putting them through
 * URLSearchParams turns each of them into the string "[object Object]" — the
 * link would not be shareable, it would be broken. They live in the browser
 * instead (loadFilter/saveFilter) and, when somebody wants to keep one, in a
 * saved view on the server.
 */
function getFilterFromSearchParams(searchParams){
    return {
        title: searchParams.get('title') || '',
        memberId: searchParams.get('memberId') || ''
    }
}

/* ------------------------------------------ Filter im Browser -- */

const FILTER_KEY = 'boardFilter'

/**
 * The filter a tab was last left with.
 *
 * Per board AND per tab. Per board alone was wrong the moment tabs existed:
 * a rule set typed into the kanban would follow you into the table, where it
 * hides rows for a reason that is now two clicks away.
 *
 * Only the built-in tabs are kept here. A saved tab carries its own rules on
 * the server, and a local copy would quietly win over them — you would edit
 * the tab, come back tomorrow and see yesterday's version with no way of
 * telling which one you are looking at.
 *
 * Read defensively — this is browser storage, and it survives the release in
 * which a rule shape changes.
 */
function loadFilter(boardId, tabId = 'table'){
    const all = utilService.loadFromStorage(FILTER_KEY) || {}
    const forBoard = all[boardId]
    const saved = (forBoard && typeof forBoard === 'object')?forBoard[tabId]:null
    const filter = getDefaultFilterBoard()
    if(!saved || typeof saved !== 'object') return filter

    if(typeof saved.title === 'string') filter.title = saved.title
    if(typeof saved.memberId === 'string') filter.memberId = saved.memberId
    if(Array.isArray(saved.rules)) filter.rules = saved.rules.filter(r => r && typeof r === 'object')
    if(saved.mode === MODE_ANY || saved.mode === MODE_ALL) filter.mode = saved.mode
    return filter
}

function saveFilter(boardId, tabId, filter){
    if(!boardId || !tabId) return
    const all = utilService.loadFromStorage(FILTER_KEY) || {}
    const forBoard = (all[boardId] && typeof all[boardId] === 'object')?{...all[boardId]}:{}
    const isEmpty = !filter || (!filter.title && !filter.memberId && !hasRules(filter.rules))

    // An empty filter is not worth a row. Kept as one, the store grows by a
    // tab every time anybody opens one and never shrinks again.
    if(isEmpty) delete forBoard[tabId]
    else forBoard[tabId] = {
        title: filter.title || '',
        memberId: filter.memberId || '',
        rules: filter.rules || [],
        mode: filter.mode || MODE_ALL
    }

    if(Object.keys(forBoard).length) all[boardId] = forBoard
    else delete all[boardId]
    utilService.saveToStorage(FILTER_KEY, all)
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
        // When it was pinned to the top of the task; null = not pinned.
        'pinnedAt': null,
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
        'description': ''
    }
}


