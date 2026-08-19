import {boardService} from '../services/board.service.js'

import {store} from './store.js'
import {
    SET_FILTER_BOARD,
    SET_BOARDS,
    SET_BOARD,
    REMOVE_BOARD,
    ADD_BOARD,
    UPDATE_BOARD,
    SET_FILTER,
    SET_MODAL,
    SET_DYNAMIC_MODAL
} from './board.reducer.js'
import {utilService} from '../services/util.service.js'

/* ======================================================================
 * Why this file looks the way it does
 *
 * It used to be that almost every change ended in `saveBoard(board)` — the
 * whole board travels to the server and overwrites everything there. If two
 * people work on the same board at the same time, the last write wins and the
 * other person's change is gone.
 *
 * Now every action sends only what actually changed and gets the fresh board
 * back from the server. `saveBoard` is left for creating and duplicating
 * whole boards, nothing else.
 * ==================================================================== */

/**
 * Private deep copy of the board as last read from the server.
 *
 * Why not simply the store: components pass objects from the store around and
 * change them in place here and there — the task dialog does
 * task.comments.unshift(...), for one. The comparison would then have compared
 * the already changed object with itself, found no difference and saved
 * nothing at all. That is exactly what happened with new comments.
 */
let _serverBoard = null

function _rememberServer(board){
    if(!board){
        _serverBoard = null;
        return
    }
    try {
        _serverBoard = structuredClone(board)
    } catch(err) {
        try {
            _serverBoard = JSON.parse(JSON.stringify(board))
        } catch(e) {
            _serverBoard = null
        }
    }
}

/** The state we know the server has — null otherwise. */
function _serverStateOf(boardId){
    if(!_serverBoard || String(_serverBoard._id) !== String(boardId)) return null
    return _serverBoard
}

/** Compared through the serialised form. A false negative is harmless (a field
 *  travels along for nothing), a false positive would not be — hence
 *  deliberately strict. */
function _same(a, b){
    return JSON.stringify(a) === JSON.stringify(b)
}

/** Write a board into the store without a socket message (for optimistic
 *  intermediate states while dragging). */
function _applyLocal(board){
    if(!board) return
    const {filter} = store.getState().boardModule
    store.dispatch({type: SET_BOARD, board})
    store.dispatch({type: SET_FILTER_BOARD, filteredBoard: boardService.getFilteredBoard(board, filter)})
}

/**
 * Anchor the fresh board from the server in the store.
 *
 * Important: if a DIFFERENT board was changed (the folder of a board from the
 * sidebar, say), the board currently open must not be overwritten — then only
 * the board list is updated.
 */
function _applyBoard(fresh){
    if(!fresh) return fresh
    store.dispatch({type: UPDATE_BOARD, board: fresh})

    const {board, filter} = store.getState().boardModule
    if(board && board._id !== fresh._id) return fresh

    _rememberServer(fresh)
    const filteredBoard = boardService.getFilteredBoard(fresh, filter)
    store.dispatch({type: SET_BOARD, board: fresh})
    store.dispatch({type: SET_FILTER_BOARD, filteredBoard})
    // No relay to the others any more. The server pushes the board it has just
    // read back, to everyone in the room including this browser — that is the
    // only version anybody can check, and it is no longer whoever saved who
    // decides what the rest of the team sees.
    return fresh
}

function _currBoard(){
    return store.getState().boardModule.board
}

export async function loadBoards(filterBy){
    try {
        const boards = await boardService.query(filterBy)
        store.dispatch({type: SET_BOARDS, boards})
    } catch(err) {
        throw err
    }
}

/**
 * A board pushed by the server.
 *
 * Both arguments are the same board now — the event kept its shape so that a
 * page left open across the deploy does not break. The filter is applied HERE,
 * from this browser's own state: it used to arrive pre-filtered by whoever
 * saved, which meant their filter briefly became everybody's.
 */
export async function loadSocketBoard(filteredBoard, board){
    const fresh = board || filteredBoard
    if(!fresh || !fresh._id) return

    // A push for a board this browser is not looking at any more. It arrives
    // while switching boards, and applying it would put the previous one back
    // on screen.
    const current = store.getState().boardModule.board
    if(current && current._id !== fresh._id) return

    _rememberServer(fresh)
    const {filter} = store.getState().boardModule
    store.dispatch({type: SET_BOARD, board: fresh})
    store.dispatch({type: SET_FILTER_BOARD, filteredBoard: boardService.getFilteredBoard(fresh, filter)})
}

export async function loadBoard(boardId, filterBy){
    try {
        const board = await boardService.getById(boardId)
        _rememberServer(board)
        const filteredBoard = boardService.getFilteredBoard(board, filterBy)
        store.dispatch({type: SET_BOARD, board})
        store.dispatch({type: SET_FILTER_BOARD, filteredBoard})
    } catch(err) {
        console.log('Had issues loading', err)
        throw err
    }
}

export async function removeBoard(boardId){
    try {
        await boardService.remove(boardId)
        store.dispatch({type: REMOVE_BOARD, boardId})
    } catch(err) {
        console.log('cant remove', err)
        throw err
    }
}

/**
 * Write a whole board.
 *
 * Use this ONLY for creating and duplicating a board. For changes to an
 * existing board there are the targeted actions further down — otherwise two
 * people overwrite each other.
 */
export async function saveBoard(board){
    const type = (board._id)?UPDATE_BOARD:ADD_BOARD
    if(board._id){
        // Tripwire: if this shows up in the log, someone is writing a whole board
        // again and other people's changes are being lost along the way.
        console.warn('saveBoard mit vorhandener _id — bitte eine der gezielten Aktionen benutzen:', board._id)
    }
    try {
        const newBoard = await boardService.save(board)
        store.dispatch({type, board: newBoard})
        // On create it is the server that hands out the _id — hence newBoard, not board.
        return newBoard
    } catch(err) {
        console.error('cant save board:', err)
        throw err
    }
}

/** Kopf-Daten eines Boards: Titel, Beschreibung, Ordner, Stern ... */
export async function updateBoardMeta(boardId, patch){
    try {
        return _applyBoard(await boardService.updateMeta(boardId, patch))
    } catch(err) {
        console.error('cant update board:', err)
        throw err
    }
}

export async function updateBoardMembers(boardId, members){
    try {
        return _applyBoard(await boardService.setMembers(boardId, members))
    } catch(err) {
        console.error('cant update members:', err)
        throw err
    }
}

/**
 * Remove a member from a board.
 *
 * The person is first taken out of the tasks they are assigned to — task by
 * task, not across the whole board. Only then are they removed from the member
 * list.
 */
export async function removeBoardMember(board, memberId){
    const boardId = board._id
    const id = String(memberId)
    try {
        for(const group of board.groups || []){
            for(const task of group.tasks || []){
                const ids = task.memberIds || []
                if(!ids.some(m => String(m) === id)) continue
                await boardService.patchTask(boardId, group.id, task.id,
                    {memberIds: ids.filter(m => String(m) !== id)})
            }
        }
        const members = (board.members || []).filter(m => String(m._id) !== id)
        return _applyBoard(await boardService.setMembers(boardId, members))
    } catch(err) {
        console.error('cant remove member:', err)
        throw err
    }
}

export async function updateBoardOwners(boardId, ownerIds){
    try {
        return _applyBoard(await boardService.setOwners(boardId, ownerIds))
    } catch(err) {
        console.error('cant update owners:', err)
        throw err
    }
}

/** Save the column list of the board (order, titles, adding, removing). */
export async function updateBoardColumns(filteredBoard, columns){
    try {
        return _applyBoard(await boardService.setColumns(filteredBoard._id, columns))
    } catch(err) {
        console.error('cant save columns:', err)
        throw err
    }
}

/**
 * Save the labels of a column.
 *
 * For status, tasks store the label TITLE, not its id. So when a label is
 * renamed or removed, the affected tasks have to follow — otherwise they sit
 * on a value that no longer exists and shows up as grey nothing in the
 * interface.
 *
 * Deliberately task by task and only that one field: it is usually a handful
 * of tasks, and this way a rename does not overwrite anyone's other columns.
 *
 *   renames  { "old title": "new title" }
 *   removed  [ "deleted title", ... ]  -> the affected tasks are cleared
 */
export async function saveColumnLabels(board, column, labels, renames = {}, removed = []){
    const boardId = board._id
    const field = column.field || column.id
    const source = _serverStateOf(boardId) || _currBoard() || board
    const removedSet = new Set(removed || [])

    try {
        for(const group of source.groups || []){
            for(const task of group.tasks || []){
                const value = task?task[field]:null
                if(typeof value !== 'string' || !value) continue

                let next = null
                if(Object.prototype.hasOwnProperty.call(renames, value)) next = renames[value]
                else if(removedSet.has(value)) next = ''
                if(next === null || next === value) continue

                await boardService.patchTask(boardId, group.id, task.id, {[field]: next})
            }
        }

        const columns = (source.columns || []).map(c => c.id === column.id?{...c, labels}:c)
        return _applyBoard(await boardService.setColumns(boardId, columns))
    } catch(err) {
        console.error('cant save labels:', err)
        throw err
    }
}


/**
 * Save the tag list of a column, and repair the tasks that used what changed.
 *
 * Three shapes of change, and only the last two touch tasks at all:
 *
 *   - adding, renaming, recolouring: the column alone. That is the whole
 *     reason a task stores the tag's ID and not its word — a rename is one
 *     entry here and no task is written.
 *   - `mergeFrom`/`mergeInto`: every task carrying the first gets the second
 *     instead, and keeps its other tags. A task that already had both ends up
 *     with it once, not twice.
 *   - `removed`: the ids are dropped from every task that held them.
 *
 * The tasks first, the column last. The other way round would leave a moment
 * where a task points at a tag the column no longer defines — and if the
 * second write failed, that moment would be permanent.
 */
export async function saveColumnTags(board, column, tags, {mergeFrom = null, mergeInto = null, removed = []} = {}){
    const boardId = board._id
    const field = column.field || column.id
    const source = _serverStateOf(boardId) || _currBoard() || board
    const removedSet = new Set(removed || [])

    try {
        if(mergeFrom || removedSet.size){
            for(const group of source.groups || []){
                for(const task of group.tasks || []){
                    const value = Array.isArray(task?task[field]:null)?task[field]:[]
                    if(!value.length) continue

                    let next = value.filter(id => !removedSet.has(id))
                    if(mergeFrom && next.includes(mergeFrom)){
                        next = next.filter(id => id !== mergeFrom)
                        if(mergeInto && !next.includes(mergeInto)) next.push(mergeInto)
                    }
                    if(next.length === value.length && next.every((id, i) => id === value[i])) continue

                    await boardService.patchTask(boardId, group.id, task.id, {[field]: next})
                }
            }
        }

        const columns = (source.columns || []).map(c => c.id === column.id?{...c, tags}:c)
        return _applyBoard(await boardService.setColumns(boardId, columns))
    } catch(err) {
        console.error('cant save tags:', err)
        throw err
    }
}

export async function addGroup(filteredBoard){
    try {
        const group = boardService.getEmptyGroup()
        group.id = utilService.makeId()
        _applyBoard(await boardService.addGroup(filteredBoard._id, group, 0))
        return group
    } catch(err) {
        throw err
    }
}

export async function duplicateGroup(filteredBoard, group){
    try {
        const duplicatedGroup = structuredClone(group)
        duplicatedGroup.id = utilService.makeId()
        const groups = _currBoard()?.groups || []
        const idx = groups.findIndex(g => g.id === group.id)
        _applyBoard(await boardService.addGroup(filteredBoard._id, duplicatedGroup, idx < 0?null:idx + 1))
    } catch(err) {
        throw err
    }
}

export async function duplicateTask(filteredBoard, group, task){
    try {
        const duplicatedTask = structuredClone(task)
        duplicatedTask.id = utilService.makeId()
        duplicatedTask.title = (duplicatedTask.title || '') + ' (copy)'
        const idx = (group.tasks || []).findIndex(t => t.id === task.id)
        _applyBoard(await boardService.addTask(filteredBoard._id, group.id, duplicatedTask, idx < 0?null:idx + 1))
    } catch(err) {
        throw err
    }
}

export async function addTask(task, group, filteredBoard, activity){
    try {
        const boardId = filteredBoard._id
        task.id = utilService.makeId()
        if(activity){
            activity.task = {id: task.id, title: task.title}
            await boardService.addActivity(boardId, activity)
        }
        _applyBoard(await boardService.addTask(boardId, group.id, task))
    } catch(err) {
        throw err
    }
}

export async function addTaskOnFirstGroup(filteredBoard){
    try {
        let groups = _currBoard()?.groups || []
        if(!groups.length){
            await addGroup(filteredBoard)
            groups = _currBoard()?.groups || []
        }
        const first = groups[0]
        if(!first) return
        const taskToAdd = boardService.getEmptyTask()
        taskToAdd.id = utilService.makeId()
        taskToAdd.title = 'New Task'
        _applyBoard(await boardService.addTask(filteredBoard._id, first.id, taskToAdd))
    } catch(err) {
        throw err
    }
}

/**
 * The task dialog hangs off the URL. `setModalOpen` only keeps the flag in the
 * store in sync (dimming the background, socket effect).
 */
export function setModalOpen(isOpen){
    store.dispatch({type: SET_MODAL, isOpen})
}

export function toggleModal(isOpenModal){
    store.dispatch({type: SET_MODAL, isOpen: !isOpenModal})
}

/**
 * Delete a group.
 *
 * It was called `updateGroups`, and that name cost the colour palette: it read
 * like the save function next to it, so the palette called it to store a
 * colour and deleted the group instead. It survived only because the group was
 * handed over whole where an id was expected — the object stringified into the
 * URL, matched nothing, and the request quietly did nothing at all.
 */
export async function removeGroupAction(groupId, filteredBoard){
    _applyBoard(await boardService.deleteGroup(filteredBoard._id, groupId))
}

/**
 * Save a group.
 *
 * Callers hand over the finished group. What actually changed against the
 * state in the store is worked out here, and only that is sent to the server.
 * If none of the narrow cases fits, the whole group is replaced — still a lot
 * better than the whole board.
 */
export async function updateGroupAction(filteredBoard, saveGroup){
    try {
        const boardId = filteredBoard._id
        const server = _serverStateOf(boardId)
        const prev = server?(server.groups || []).find(g => g.id === saveGroup.id):null
        _applyBoard(await _saveGroupSmart(boardId, prev, saveGroup))
    } catch(err) {
        throw err
    }
}

async function _saveGroupSmart(boardId, prev, next){
    if(!prev) return await boardService.replaceGroup(boardId, next.id, next)

    const prevTasks = prev.tasks || []
    const nextTasks = next.tasks || []
    const prevIds = prevTasks.map(t => t.id)
    const nextIds = nextTasks.map(t => t.id)

    // 1. What changed in the head of the group (title, colour ...)?
    const metaPatch = {}
    for(const key of Object.keys(next)){
        if(key === 'id' || key === 'tasks') continue
        if(!_same(prev[key], next[key])) metaPatch[key] = next[key]
    }
    const hasMeta = Object.keys(metaPatch).length > 0

    if(_same(prevTasks, nextTasks)){
        if(!hasMeta) return await boardService.getById(boardId)
        return await boardService.patchGroup(boardId, next.id, metaPatch)
    }
    if(hasMeta) await boardService.patchGroup(boardId, next.id, metaPatch)

    const removed = prevIds.filter(id => !nextIds.includes(id))
    const added = nextIds.filter(id => !prevIds.includes(id))

    // 2. Exactly one task removed, nothing else.
    if(removed.length === 1 && !added.length
        && _same(nextTasks, prevTasks.filter(t => t.id !== removed[0]))){
        return await boardService.deleteTask(boardId, next.id, removed[0])
    }

    // 3. Exactly one task added, nothing else.
    if(added.length === 1 && !removed.length){
        const idx = nextIds.indexOf(added[0])
        if(_same(nextTasks.filter(t => t.id !== added[0]), prevTasks)){
            return await boardService.addTask(boardId, next.id, nextTasks[idx], idx)
        }
    }

    // 4. Same tasks: either only reordered or exactly one changed.
    if(!added.length && !removed.length){
        const prevById = new Map(prevTasks.map(t => [t.id, t]))
        const changed = nextTasks.filter(t => !_same(t, prevById.get(t.id)))
        if(!changed.length) return await boardService.reorderTasks(boardId, next.id, nextIds)
        if(changed.length === 1 && _same(prevIds, nextIds)){
            return await boardService.replaceTask(boardId, next.id, changed[0].id, changed[0])
        }
    }

    // 5. Anything else: replace the whole group.
    return await boardService.replaceGroup(boardId, next.id, next)
}

/**
 * Save a task.
 *
 * Only the fields that differ from the state in the store travel to the
 * server. That lets two people change different columns of the same task at
 * the same time without overwriting each other.
 */
/**
 * A task of this group, top level or one below.
 *
 * Without the second level every edit to a subtask would find no previous
 * state, fall back to "replace the whole task" and send the lot over the wire
 * — correct, but it throws away the reason the diff exists.
 */
function _findTaskDeep(group, taskId){
    for(const task of group?.tasks || []){
        if(task.id === taskId) return task
        const child = (task.subtasks || []).find(t => t.id === taskId)
        if(child) return child
    }
    return null
}

/**
 * Add a subtask under a task.
 *
 * The server decides the id and the position; the answer is the whole board,
 * so nothing has to be stitched together here.
 */
export async function addSubtaskAction(filteredBoard, groupId, parentId, subtask, index = null){
    _applyBoard(await boardService.addSubtask(filteredBoard._id, groupId, parentId, subtask, index))
}

/**
 * Delete a task or a subtask.
 *
 * Deleting a task used to happen by handing `updateGroupAction` a group with
 * one task missing and letting the diff notice. That works for a task but not
 * for a subtask: the children are not in `group.tasks`, so the diff sees no
 * change at all. This goes straight at the task, which the server accepts on
 * either level.
 */
export async function removeTaskAction(filteredBoard, groupId, taskId){
    _applyBoard(await boardService.deleteTask(filteredBoard._id, groupId, taskId))
}

/* ------------------------------------------ Papierkorb und Archiv -- */

/**
 * Move a task or a group into the archive, into the bin, or back.
 *
 * The server answers with the whole board either way, so the row disappears or
 * reappears without the client working out what changed — which is what it
 * would have to do, since a restored row was not in the board it holds.
 */
export async function setTaskStateAction(filteredBoard, taskId, state){
    _applyBoard(await boardService.setTaskState(filteredBoard._id, taskId, state))
}

export async function setGroupStateAction(filteredBoard, groupId, state){
    _applyBoard(await boardService.setGroupState(filteredBoard._id, groupId, state))
}

/**
 * Turn a task into a subtask of another, or a subtask back into a task.
 *
 * Not expressible as a patch: the task leaves one ordered list and joins
 * another, and both have to stay gapless. The server does it in one
 * transaction and answers with the whole board.
 */
export async function setTaskParentAction(filteredBoard, groupId, taskId, parentId, index = null){
    _applyBoard(await boardService.setTaskParent(filteredBoard._id, groupId, taskId, parentId, index))
}

/**
 * Change one person's role on a board.
 *
 * The server answers with the whole board, so the member list, everyone's
 * rights and every control that depends on them update in one go — there is no
 * moment where the screen shows the old role and the new rules.
 */
export async function setMemberRoleAction(boardId, userId, role){
    _applyBoard(await boardService.setMemberRole(boardId, userId, role))
}

export async function updateTaskAction(filteredBoard, groupId, saveTask, activity){
    try {
        const boardId = filteredBoard._id
        const patch = _diffTask(boardId, groupId, saveTask)
        if(activity) await boardService.addActivity(boardId, activity)

        let fresh
        if(patch === null){
            fresh = await boardService.replaceTask(boardId, groupId, saveTask.id, saveTask)
        } else if(!Object.keys(patch).length){
            if(!activity) return
            fresh = await boardService.getById(boardId)
        } else {
            fresh = await boardService.patchTask(boardId, groupId, saveTask.id, patch)
        }
        _applyBoard(fresh)
    } catch(err) {
        throw err
    }
}

/** Geaenderte Felder eines Tasks. `null` heisst: lieber komplett ersetzen. */
function _diffTask(boardId, groupId, saveTask){
    const server = _serverStateOf(boardId)
    if(!server) return null
    const group = (server.groups || []).find(g => g.id === groupId)
    const prev = _findTaskDeep(group, saveTask.id)
    if(!prev) return null
    // A field has fallen away — a patch cannot express that.
    for(const key of Object.keys(prev)){
        if(!(key in saveTask)) return null
    }
    const patch = {}
    for(const key of Object.keys(saveTask)){
        if(key === 'id') continue
        if(!_same(prev[key], saveTask[key])) patch[key] = saveTask[key]
    }
    return patch
}

/** Move the selected tasks into another group of the same board. */
export async function moveTasksToGroup(boardId, taskIds, fromGroupId, toGroupId){
    let fresh = null
    for(const taskId of taskIds){
        fresh = await boardService.moveTask(boardId, taskId, fromGroupId, toGroupId)
    }
    if(fresh) _applyBoard(fresh)
    return fresh
}

export async function toggleStarred(filteredBoard, isStarred){
    try {
        const curr = _currBoard()
        const next = !(curr && curr._id === filteredBoard._id?curr.isStarred:filteredBoard.isStarred)
        _applyBoard(await boardService.updateMeta(filteredBoard._id, {isStarred: next}))
        const filter = boardService.getDefaultFilterBoards()
        filter.isStarred = isStarred
        store.dispatch({type: SET_BOARDS, boards: await boardService.query(filter)})
    } catch(err) {
        throw err
    }
}

/** The server caps the length of the list (MAX_ACTIVITIES). */
export async function addActivity(filteredBoard, activity){
    try {
        _applyBoard(await boardService.addActivity(filteredBoard._id, activity))
    } catch(err) {
        throw err
    }
}

export function setFilter(filter){
    store.dispatch({type: SET_FILTER, filter})
}

/**
 * Identity of a popup: same type on the same object = the same popup.
 * Needed so that a click on the triggering button does not immediately reopen
 * the popup that the outside click has just closed.
 */
function _modalKey(obj){
    if(!obj) return ''
    return [obj.type, obj.task?.id, obj.group?.id, obj.columnId, obj.board?._id].join('|')
}

let _lastClosed = {key: '', at: 0}

export function setDynamicModalObj(dynamicModalObj){
    if(dynamicModalObj?.isOpen
        && _modalKey(dynamicModalObj) === _lastClosed.key
        && Date.now() - _lastClosed.at < 400){
        // The same click that just closed it from outside — do not open it again.
        _lastClosed = {key: '', at: 0}
        return
    }
    store.dispatch({type: SET_DYNAMIC_MODAL, dynamicModalObj})
}

/** Used by the outside-click handler before closing. */
export function noteDynamicModalClosedByOutsideClick(){
    const {dynamicModalObj} = store.getState().boardModule
    _lastClosed = {key: _modalKey(dynamicModalObj), at: Date.now()}
}

export function closeDynamicModal(){
    const {dynamicModalObj} = store.getState().boardModule
    // New object: Redux compares by reference. When only isOpen was mutated here,
    // the reference stayed the same and React did not re-render —
    // the popup stayed visible.
    store.dispatch({type: SET_DYNAMIC_MODAL, dynamicModalObj: {...dynamicModalObj, isOpen: false}})
}

/* ----------------------------------------------------------------------
 * Drag and drop
 *
 * Dragging happens on the filtered board, saving on the real one. So the new
 * order is built from the visible list and topped up with the entries
 * currently hidden — that way nothing is lost when dragging with a filter on.
 * -------------------------------------------------------------------- */
function _mergeOrder(visibleIds, allIds){
    const seen = new Set(visibleIds)
    return [...visibleIds.filter(id => allIds.includes(id)), ...allIds.filter(id => !seen.has(id))]
}

export async function handleOnDragEnd(result, board){
    if(!result.destination) return
    const shown = board || _currBoard()
    const full = _currBoard() || shown
    if(!shown || !full) return
    const boardId = full._id
    const prevBoard = full

    try {
        if(result.type === 'group'){
            const visible = (shown.groups || []).map(g => g.id)
            const [moved] = visible.splice(result.source.index, 1)
            visible.splice(result.destination.index, 0, moved)
            const order = _mergeOrder(visible, (full.groups || []).map(g => g.id))

            const byId = new Map((full.groups || []).map(g => [g.id, g]))
            _applyLocal({...full, groups: order.map(id => byId.get(id)).filter(Boolean)})
            _applyBoard(await boardService.reorderGroups(boardId, order))
            return
        }

        if(result.type !== 'task') return
        const fromGroupId = result.source.droppableId
        const toGroupId = result.destination.droppableId
        const shownFrom = (shown.groups || []).find(g => g.id === fromGroupId)
        const taskId = shownFrom?.tasks?.[result.source.index]?.id
        if(!taskId) return

        // Within the same group: only the order.
        if(fromGroupId === toGroupId){
            const visible = (shownFrom.tasks || []).map(t => t.id)
            const [moved] = visible.splice(result.source.index, 1)
            visible.splice(result.destination.index, 0, moved)
            const fullFrom = (full.groups || []).find(g => g.id === fromGroupId)
            const order = _mergeOrder(visible, (fullFrom?.tasks || []).map(t => t.id))

            const byId = new Map((fullFrom?.tasks || []).map(t => [t.id, t]))
            _applyLocal({
                ...full,
                groups: (full.groups || []).map(g => g.id === fromGroupId
                    ?{...g, tasks: order.map(id => byId.get(id)).filter(Boolean)}
                    :g)
            })
            _applyBoard(await boardService.reorderTasks(boardId, fromGroupId, order))
            return
        }

        // Ueber Gruppen hinweg: verschieben.
        const optimistic = structuredClone(full)
        const oFrom = optimistic.groups.find(g => g.id === fromGroupId)
        const oTo = optimistic.groups.find(g => g.id === toGroupId)
        if(oFrom && oTo){
            const idx = (oFrom.tasks || []).findIndex(t => t.id === taskId)
            if(idx >= 0){
                const [t] = oFrom.tasks.splice(idx, 1)
                oTo.tasks.splice(Math.min(result.destination.index, oTo.tasks.length), 0, t)
                _applyLocal(optimistic)
            }
        }
        _applyBoard(await boardService.moveTask(boardId, taskId, fromGroupId, toGroupId,
            result.destination.index))
    } catch(err) {
        // Failed: restore the state from before.
        _applyLocal(prevBoard)
        console.error('moving a task failed', err)
    }
}
