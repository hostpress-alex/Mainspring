import { boardService } from '../services/board.service.js'

import { store } from './store.js'
import { SET_FILTER_BOARD, SET_BOARDS, SET_BOARD, REMOVE_BOARD, ADD_BOARD, UPDATE_BOARD, SET_FILTER, SET_MODAL, SET_DYNAMIC_MODAL } from "./board.reducer.js"
import { utilService } from '../services/util.service.js'
import { socketService, SOCKET_EMIT_SEND_UPDATE_BOARD } from '../services/socket.service.js'

/* ======================================================================
 * Warum diese Datei so aussieht, wie sie aussieht
 *
 * Frueher endete fast jede Aenderung in `saveBoard(board)` — also: das
 * komplette Board wandert zum Server und ueberschreibt dort alles. Arbeiten
 * zwei Leute gleichzeitig am selben Board, gewinnt der letzte Schreibvorgang
 * und die Aenderung des anderen ist weg.
 *
 * Jetzt schickt jede Aktion nur noch das, was sich wirklich geaendert hat,
 * und bekommt das frische Board vom Server zurueck. `saveBoard` bleibt nur
 * noch fuer das Anlegen und Duplizieren ganzer Boards.
 * ==================================================================== */

/**
 * Private Tiefkopie des zuletzt vom Server gelesenen Boards.
 *
 * Warum nicht einfach der Store: Komponenten reichen Objekte aus dem Store
 * durch und aendern sie stellenweise direkt — der Task-Dialog macht zum
 * Beispiel task.comments.unshift(...). Der Vergleich haette dann das schon
 * geaenderte Objekt mit sich selbst verglichen, keinen Unterschied gefunden
 * und gar nichts gespeichert. Genau das war der Fall bei neuen Kommentaren.
 */
let _serverBoard = null

function _rememberServer(board) {
    if (!board) { _serverBoard = null; return }
    try {
        _serverBoard = structuredClone(board)
    } catch (err) {
        try { _serverBoard = JSON.parse(JSON.stringify(board)) } catch (e) { _serverBoard = null }
    }
}

/** Der Stand, von dem wir wissen, dass der Server ihn hat — sonst null. */
function _serverStateOf(boardId) {
    if (!_serverBoard || String(_serverBoard._id) !== String(boardId)) return null
    return _serverBoard
}

/** Vergleich ueber die serialisierte Form. Ein falsch-negativer Treffer ist
 *  harmlos (dann wandert ein Feld unnoetig mit), ein falsch-positiver waere
 *  es nicht — deshalb bewusst streng. */
function _same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b)
}

/** Board in den Store schreiben, ohne Socket-Meldung (fuer optimistische
 *  Zwischenzustaende beim Ziehen). */
function _applyLocal(board) {
    if (!board) return
    const { filter } = store.getState().boardModule
    store.dispatch({ type: SET_BOARD, board })
    store.dispatch({ type: SET_FILTER_BOARD, filteredBoard: boardService.getFilteredBoard(board, filter) })
}

/**
 * Das frische Board vom Server im Store verankern.
 *
 * Wichtig: wurde ein ANDERES Board geaendert (z.B. der Ordner eines Boards
 * aus der Seitenleiste), darf das gerade geoeffnete Board nicht ueberschrieben
 * werden — dann wird nur die Board-Liste aktualisiert.
 */
function _applyBoard(fresh) {
    if (!fresh) return fresh
    store.dispatch({ type: UPDATE_BOARD, board: fresh })

    const { board, filter } = store.getState().boardModule
    if (board && board._id !== fresh._id) return fresh

    _rememberServer(fresh)
    const filteredBoard = boardService.getFilteredBoard(fresh, filter)
    store.dispatch({ type: SET_BOARD, board: fresh })
    store.dispatch({ type: SET_FILTER_BOARD, filteredBoard })
    socketService.emit(SOCKET_EMIT_SEND_UPDATE_BOARD, { filteredBoard, board: fresh })
    return fresh
}

function _currBoard() {
    return store.getState().boardModule.board
}

export async function loadBoards(filterBy) {
    try {
        const boards = await boardService.query(filterBy)
        store.dispatch({ type: SET_BOARDS, boards })
    } catch (err) {
        throw err
    }
}

export async function loadSocketBoard(filteredBoard, board) {
    try {
        _rememberServer(board)
        store.dispatch({ type: SET_BOARD, board })
        if (!filteredBoard) store.dispatch({ type: SET_FILTER_BOARD, filteredBoard: board })
        else store.dispatch({ type: SET_FILTER_BOARD, filteredBoard })
    } catch (err) {
        throw err
    }
}

export async function loadBoard(boardId, filterBy) {
    try {
        const board = await boardService.getById(boardId)
        _rememberServer(board)
        const filteredBoard = boardService.getFilteredBoard(board, filterBy)
        store.dispatch({ type: SET_BOARD, board })
        store.dispatch({ type: SET_FILTER_BOARD, filteredBoard })
    } catch (err) {
        console.log('Had issues loading', err)
        throw err
    }
}

export async function removeBoard(boardId) {
    try {
        await boardService.remove(boardId)
        store.dispatch({ type: REMOVE_BOARD, boardId })
    } catch (err) {
        console.log('cant remove', err)
        throw err
    }
}

/**
 * Ganzes Board schreiben.
 *
 * NUR noch fuer das Anlegen und Duplizieren eines Boards benutzen. Fuer
 * Aenderungen an einem bestehenden Board gibt es die gezielten Aktionen
 * weiter unten — sonst ueberschreiben sich zwei Leute gegenseitig.
 */
export async function saveBoard(board) {
    const type = (board._id) ? UPDATE_BOARD : ADD_BOARD
    if (board._id) {
        // Stolperdraht: taucht das im Log auf, schreibt wieder jemand ein
        // ganzes Board und die Aenderungen anderer gehen dabei verloren.
        console.warn('saveBoard mit vorhandener _id — bitte eine der gezielten Aktionen benutzen:', board._id)
    }
    try {
        const newBoard = await boardService.save(board)
        store.dispatch({ type, board: newBoard })
        socketService.emit(SOCKET_EMIT_SEND_UPDATE_BOARD, { filteredBoard: null, board: newBoard })
        // Beim Anlegen vergibt erst der Server die _id — deshalb newBoard, nicht board.
        return newBoard
    } catch (err) {
        console.error('cant save board:', err)
        throw err
    }
}

/** Kopf-Daten eines Boards: Titel, Beschreibung, Ordner, Stern ... */
export async function updateBoardMeta(boardId, patch) {
    try {
        return _applyBoard(await boardService.updateMeta(boardId, patch))
    } catch (err) {
        console.error('cant update board:', err)
        throw err
    }
}

export async function updateBoardMembers(boardId, members) {
    try {
        return _applyBoard(await boardService.setMembers(boardId, members))
    } catch (err) {
        console.error('cant update members:', err)
        throw err
    }
}

/**
 * Mitglied aus einem Board entfernen.
 *
 * Zuerst wird die Person aus den Tasks ausgetragen, in denen sie zugewiesen
 * ist — und zwar Task fuer Task, nicht ueber das ganze Board. Erst danach
 * wird sie aus der Mitgliederliste genommen.
 */
export async function removeBoardMember(board, memberId) {
    const boardId = board._id
    const id = String(memberId)
    try {
        for (const group of board.groups || []) {
            for (const task of group.tasks || []) {
                const ids = task.memberIds || []
                if (!ids.some(m => String(m) === id)) continue
                await boardService.patchTask(boardId, group.id, task.id,
                    { memberIds: ids.filter(m => String(m) !== id) })
            }
        }
        const members = (board.members || []).filter(m => String(m._id) !== id)
        return _applyBoard(await boardService.setMembers(boardId, members))
    } catch (err) {
        console.error('cant remove member:', err)
        throw err
    }
}

export async function updateBoardOwners(boardId, ownerIds) {
    try {
        return _applyBoard(await boardService.setOwners(boardId, ownerIds))
    } catch (err) {
        console.error('cant update owners:', err)
        throw err
    }
}

/** Spaltenliste des Boards speichern (Reihenfolge, Titel, Hinzufuegen, Entfernen). */
export async function updateBoardColumns(filteredBoard, columns) {
    try {
        return _applyBoard(await boardService.setColumns(filteredBoard._id, columns))
    } catch (err) {
        console.error('cant save columns:', err)
        throw err
    }
}

/**
 * Labels einer Spalte speichern.
 *
 * Tasks speichern beim Status den TITEL des Labels, nicht seine Id. Wird ein
 * Label umbenannt oder entfernt, muessen die betroffenen Tasks deshalb
 * mitziehen — sonst stehen sie auf einem Wert, den es nicht mehr gibt und der
 * in der Oberflaeche als graues Nichts erscheint.
 *
 * Bewusst Task fuer Task und nur das eine Feld: es sind meist eine Handvoll
 * Tasks, und so ueberschreibt das Umbenennen niemandem seine anderen Spalten.
 *
 *   renames  { "Alter Titel": "Neuer Titel" }
 *   removed  [ "Geloeschter Titel", ... ]  -> betroffene Tasks werden geleert
 */
export async function saveColumnLabels(board, column, labels, renames = {}, removed = []) {
    const boardId = board._id
    const field = column.field || column.id
    const source = _serverStateOf(boardId) || _currBoard() || board
    const removedSet = new Set(removed || [])

    try {
        for (const group of source.groups || []) {
            for (const task of group.tasks || []) {
                const value = task ? task[field] : null
                if (typeof value !== 'string' || !value) continue

                let next = null
                if (Object.prototype.hasOwnProperty.call(renames, value)) next = renames[value]
                else if (removedSet.has(value)) next = ''
                if (next === null || next === value) continue

                await boardService.patchTask(boardId, group.id, task.id, { [field]: next })
            }
        }

        const columns = (source.columns || []).map(c => c.id === column.id ? { ...c, labels } : c)
        return _applyBoard(await boardService.setColumns(boardId, columns))
    } catch (err) {
        console.error('cant save labels:', err)
        throw err
    }
}

export async function updatePickerCmpsOrder(filteredBoard, cmpsOrders) {
    try {
        return _applyBoard(await boardService.updateMeta(filteredBoard._id, { cmpsOrder: cmpsOrders }))
    } catch (err) {
        throw err
    }
}

export async function addGroup(filteredBoard) {
    try {
        const group = boardService.getEmptyGroup()
        group.id = utilService.makeId()
        _applyBoard(await boardService.addGroup(filteredBoard._id, group, 0))
        return group
    } catch (err) {
        throw err
    }
}

export async function duplicateGroup(filteredBoard, group) {
    try {
        const duplicatedGroup = structuredClone(group)
        duplicatedGroup.id = utilService.makeId()
        const groups = _currBoard()?.groups || []
        const idx = groups.findIndex(g => g.id === group.id)
        _applyBoard(await boardService.addGroup(filteredBoard._id, duplicatedGroup, idx < 0 ? null : idx + 1))
    } catch (err) {
        throw err
    }
}

export async function duplicateTask(filteredBoard, group, task) {
    try {
        const duplicatedTask = structuredClone(task)
        duplicatedTask.id = utilService.makeId()
        duplicatedTask.title = (duplicatedTask.title || '') + ' (copy)'
        const idx = (group.tasks || []).findIndex(t => t.id === task.id)
        _applyBoard(await boardService.addTask(filteredBoard._id, group.id, duplicatedTask, idx < 0 ? null : idx + 1))
    } catch (err) {
        throw err
    }
}

export async function addTask(task, group, filteredBoard, activity) {
    try {
        const boardId = filteredBoard._id
        task.id = utilService.makeId()
        if (activity) {
            activity.task = { id: task.id, title: task.title }
            await boardService.addActivity(boardId, activity)
        }
        _applyBoard(await boardService.addTask(boardId, group.id, task))
    } catch (err) {
        throw err
    }
}

export async function addTaskOnFirstGroup(filteredBoard) {
    try {
        let groups = _currBoard()?.groups || []
        if (!groups.length) {
            await addGroup(filteredBoard)
            groups = _currBoard()?.groups || []
        }
        const first = groups[0]
        if (!first) return
        const taskToAdd = boardService.getEmptyTask()
        taskToAdd.id = utilService.makeId()
        taskToAdd.title = 'New Task'
        _applyBoard(await boardService.addTask(filteredBoard._id, first.id, taskToAdd))
    } catch (err) {
        throw err
    }
}

/**
 * Der Task-Dialog haengt an der URL. `setModalOpen` haelt nur noch das Flag im
 * Store synchron (Abdunkeln des Hintergrunds, Socket-Effekt).
 */
export function setModalOpen(isOpen) {
    store.dispatch({ type: SET_MODAL, isOpen })
}

export function toggleModal(isOpenModal) {
    store.dispatch({ type: SET_MODAL, isOpen: !isOpenModal })
}

/** Eine Gruppe loeschen. */
export async function updateGroups(groupId, filteredBoard) {
    try {
        _applyBoard(await boardService.deleteGroup(filteredBoard._id, groupId))
    } catch (err) {
        throw err
    }
}

/**
 * Eine Gruppe speichern.
 *
 * Die Aufrufer uebergeben die fertige Gruppe. Hier wird ermittelt, was sich
 * gegenueber dem Stand im Store tatsaechlich geaendert hat, und nur das an
 * den Server geschickt. Passt keiner der engen Faelle, wird die ganze Gruppe
 * ersetzt — immer noch deutlich besser als das ganze Board.
 */
export async function updateGroupAction(filteredBoard, saveGroup) {
    try {
        const boardId = filteredBoard._id
        const server = _serverStateOf(boardId)
        const prev = server ? (server.groups || []).find(g => g.id === saveGroup.id) : null
        _applyBoard(await _saveGroupSmart(boardId, prev, saveGroup))
    } catch (err) {
        throw err
    }
}

async function _saveGroupSmart(boardId, prev, next) {
    if (!prev) return await boardService.replaceGroup(boardId, next.id, next)

    const prevTasks = prev.tasks || []
    const nextTasks = next.tasks || []
    const prevIds = prevTasks.map(t => t.id)
    const nextIds = nextTasks.map(t => t.id)

    // 1. Was hat sich am Kopf der Gruppe geaendert (Titel, Farbe ...)?
    const metaPatch = {}
    for (const key of Object.keys(next)) {
        if (key === 'id' || key === 'tasks') continue
        if (!_same(prev[key], next[key])) metaPatch[key] = next[key]
    }
    const hasMeta = Object.keys(metaPatch).length > 0

    if (_same(prevTasks, nextTasks)) {
        if (!hasMeta) return await boardService.getById(boardId)
        return await boardService.patchGroup(boardId, next.id, metaPatch)
    }
    if (hasMeta) await boardService.patchGroup(boardId, next.id, metaPatch)

    const removed = prevIds.filter(id => !nextIds.includes(id))
    const added = nextIds.filter(id => !prevIds.includes(id))

    // 2. Genau ein Task entfernt, sonst nichts.
    if (removed.length === 1 && !added.length
        && _same(nextTasks, prevTasks.filter(t => t.id !== removed[0]))) {
        return await boardService.deleteTask(boardId, next.id, removed[0])
    }

    // 3. Genau ein Task dazugekommen, sonst nichts.
    if (added.length === 1 && !removed.length) {
        const idx = nextIds.indexOf(added[0])
        if (_same(nextTasks.filter(t => t.id !== added[0]), prevTasks)) {
            return await boardService.addTask(boardId, next.id, nextTasks[idx], idx)
        }
    }

    // 4. Gleiche Tasks: entweder nur umsortiert oder genau einer geaendert.
    if (!added.length && !removed.length) {
        const prevById = new Map(prevTasks.map(t => [t.id, t]))
        const changed = nextTasks.filter(t => !_same(t, prevById.get(t.id)))
        if (!changed.length) return await boardService.reorderTasks(boardId, next.id, nextIds)
        if (changed.length === 1 && _same(prevIds, nextIds)) {
            return await boardService.replaceTask(boardId, next.id, changed[0].id, changed[0])
        }
    }

    // 5. Alles andere: ganze Gruppe ersetzen.
    return await boardService.replaceGroup(boardId, next.id, next)
}

/**
 * Einen Task speichern.
 *
 * Es wandern nur die Felder zum Server, die sich gegenueber dem Stand im
 * Store unterscheiden. Damit koennen zwei Leute gleichzeitig verschiedene
 * Spalten desselben Tasks aendern, ohne sich zu ueberschreiben.
 */
export async function updateTaskAction(filteredBoard, groupId, saveTask, activity) {
    try {
        const boardId = filteredBoard._id
        const patch = _diffTask(boardId, groupId, saveTask)
        if (activity) await boardService.addActivity(boardId, activity)

        let fresh
        if (patch === null) {
            fresh = await boardService.replaceTask(boardId, groupId, saveTask.id, saveTask)
        } else if (!Object.keys(patch).length) {
            if (!activity) return
            fresh = await boardService.getById(boardId)
        } else {
            fresh = await boardService.patchTask(boardId, groupId, saveTask.id, patch)
        }
        _applyBoard(fresh)
    } catch (err) {
        throw err
    }
}

/** Geaenderte Felder eines Tasks. `null` heisst: lieber komplett ersetzen. */
function _diffTask(boardId, groupId, saveTask) {
    const server = _serverStateOf(boardId)
    if (!server) return null
    const group = (server.groups || []).find(g => g.id === groupId)
    const prev = (group?.tasks || []).find(t => t.id === saveTask.id)
    if (!prev) return null
    // Ein Feld ist weggefallen — das kann ein Patch nicht ausdruecken.
    for (const key of Object.keys(prev)) {
        if (!(key in saveTask)) return null
    }
    const patch = {}
    for (const key of Object.keys(saveTask)) {
        if (key === 'id') continue
        if (!_same(prev[key], saveTask[key])) patch[key] = saveTask[key]
    }
    return patch
}

/** Markierte Tasks in eine andere Gruppe desselben Boards schieben. */
export async function moveTasksToGroup(boardId, taskIds, fromGroupId, toGroupId) {
    let fresh = null
    for (const taskId of taskIds) {
        fresh = await boardService.moveTask(boardId, taskId, fromGroupId, toGroupId)
    }
    if (fresh) _applyBoard(fresh)
    return fresh
}

export async function toggleStarred(filteredBoard, isStarred) {
    try {
        const curr = _currBoard()
        const next = !(curr && curr._id === filteredBoard._id ? curr.isStarred : filteredBoard.isStarred)
        _applyBoard(await boardService.updateMeta(filteredBoard._id, { isStarred: next }))
        const filter = boardService.getDefaultFilterBoards()
        filter.isStarred = isStarred
        store.dispatch({ type: SET_BOARDS, boards: await boardService.query(filter) })
    } catch (err) {
        throw err
    }
}

/** Die Laengenbegrenzung der Liste macht der Server (MAX_ACTIVITIES). */
export async function addActivity(filteredBoard, activity) {
    try {
        _applyBoard(await boardService.addActivity(filteredBoard._id, activity))
    } catch (err) {
        throw err
    }
}

export function setFilter(filter) {
    store.dispatch({ type: SET_FILTER, filter })
}

/**
 * Kennung eines Popups: gleicher Typ am gleichen Objekt = dasselbe Popup.
 * Wird gebraucht, damit ein Klick auf den auslesenden Button das gerade per
 * Aussenklick geschlossene Popup nicht sofort wieder oeffnet.
 */
function _modalKey(obj) {
    if (!obj) return ''
    return [obj.type, obj.task?.id, obj.group?.id, obj.columnId, obj.board?._id].join('|')
}

let _lastClosed = { key: '', at: 0 }

export function setDynamicModalObj(dynamicModalObj) {
    if (dynamicModalObj?.isOpen
        && _modalKey(dynamicModalObj) === _lastClosed.key
        && Date.now() - _lastClosed.at < 400) {
        // Derselbe Klick, der eben ausserhalb geschlossen hat — nicht erneut oeffnen.
        _lastClosed = { key: '', at: 0 }
        return
    }
    store.dispatch({ type: SET_DYNAMIC_MODAL, dynamicModalObj })
}

/** Wird vom Aussenklick-Handler benutzt, bevor geschlossen wird. */
export function noteDynamicModalClosedByOutsideClick() {
    const { dynamicModalObj } = store.getState().boardModule
    _lastClosed = { key: _modalKey(dynamicModalObj), at: Date.now() }
}

export function closeDynamicModal() {
    const { dynamicModalObj } = store.getState().boardModule
    // Neues Objekt: Redux vergleicht per Referenz. Wurde hier frueher nur
    // isOpen mutiert, blieb die Referenz gleich und React rendert nicht neu —
    // das Popup blieb sichtbar.
    store.dispatch({ type: SET_DYNAMIC_MODAL, dynamicModalObj: { ...dynamicModalObj, isOpen: false } })
}

/* ----------------------------------------------------------------------
 * Ziehen und Ablegen
 *
 * Gezogen wird auf dem gefilterten Board, gespeichert wird auf dem echten.
 * Deshalb wird die neue Reihenfolge aus der angezeigten Liste gebildet und
 * um die gerade ausgeblendeten Eintraege ergaenzt — so geht beim Ziehen mit
 * aktivem Filter nichts verloren.
 * -------------------------------------------------------------------- */
function _mergeOrder(visibleIds, allIds) {
    const seen = new Set(visibleIds)
    return [...visibleIds.filter(id => allIds.includes(id)), ...allIds.filter(id => !seen.has(id))]
}

export async function handleOnDragEnd(result, board) {
    if (!result.destination) return
    const shown = board || _currBoard()
    const full = _currBoard() || shown
    if (!shown || !full) return
    const boardId = full._id
    const prevBoard = full

    try {
        if (result.type === 'group') {
            const visible = (shown.groups || []).map(g => g.id)
            const [moved] = visible.splice(result.source.index, 1)
            visible.splice(result.destination.index, 0, moved)
            const order = _mergeOrder(visible, (full.groups || []).map(g => g.id))

            const byId = new Map((full.groups || []).map(g => [g.id, g]))
            _applyLocal({ ...full, groups: order.map(id => byId.get(id)).filter(Boolean) })
            _applyBoard(await boardService.reorderGroups(boardId, order))
            return
        }

        if (result.type !== 'task') return
        const fromGroupId = result.source.droppableId
        const toGroupId = result.destination.droppableId
        const shownFrom = (shown.groups || []).find(g => g.id === fromGroupId)
        const taskId = shownFrom?.tasks?.[result.source.index]?.id
        if (!taskId) return

        // Innerhalb derselben Gruppe: nur die Reihenfolge.
        if (fromGroupId === toGroupId) {
            const visible = (shownFrom.tasks || []).map(t => t.id)
            const [moved] = visible.splice(result.source.index, 1)
            visible.splice(result.destination.index, 0, moved)
            const fullFrom = (full.groups || []).find(g => g.id === fromGroupId)
            const order = _mergeOrder(visible, (fullFrom?.tasks || []).map(t => t.id))

            const byId = new Map((fullFrom?.tasks || []).map(t => [t.id, t]))
            _applyLocal({
                ...full,
                groups: (full.groups || []).map(g => g.id === fromGroupId
                    ? { ...g, tasks: order.map(id => byId.get(id)).filter(Boolean) }
                    : g)
            })
            _applyBoard(await boardService.reorderTasks(boardId, fromGroupId, order))
            return
        }

        // Ueber Gruppen hinweg: verschieben.
        const optimistic = structuredClone(full)
        const oFrom = optimistic.groups.find(g => g.id === fromGroupId)
        const oTo = optimistic.groups.find(g => g.id === toGroupId)
        if (oFrom && oTo) {
            const idx = (oFrom.tasks || []).findIndex(t => t.id === taskId)
            if (idx >= 0) {
                const [t] = oFrom.tasks.splice(idx, 1)
                oTo.tasks.splice(Math.min(result.destination.index, oTo.tasks.length), 0, t)
                _applyLocal(optimistic)
            }
        }
        _applyBoard(await boardService.moveTask(boardId, taskId, fromGroupId, toGroupId,
            result.destination.index))
    } catch (err) {
        // Fehlgeschlagen: den Stand von vorher wiederherstellen.
        _applyLocal(prevBoard)
        console.error('Verschieben fehlgeschlagen', err)
    }
}
