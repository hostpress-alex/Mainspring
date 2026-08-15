import { httpService } from './http.service'

const BASE_URL = 'schedule/'

export const scheduleService = {
    query,
    save,
    remove,
    tasksFromBoards,
}

/** Eintraege, die den Zeitraum [from, to) beruehren. */
function query(from, to) {
    return httpService.get(BASE_URL, { from: from.toISOString(), to: to.toISOString() })
}

function save(entry) {
    const payload = {
        boardId: entry.boardId,
        taskId: entry.taskId,
        start: new Date(entry.start).toISOString(),
        end: new Date(entry.end).toISOString(),
        note: entry.note || '',
    }
    if (entry._id) return httpService.put(BASE_URL + entry._id, payload)
    return httpService.post(BASE_URL, payload)
}

function remove(entryId) {
    return httpService.delete(BASE_URL + entryId)
}

/**
 * Flache, durchsuchbare Liste aller Tasks aus den Boards des Benutzers —
 * Datenquelle fuer die Task-Auswahl im Dialog.
 */
function tasksFromBoards(boards = []) {
    const out = []
    for (const board of boards) {
        for (const group of board.groups || []) {
            for (const task of group.tasks || []) {
                out.push({
                    boardId: board._id,
                    boardTitle: board.title,
                    groupId: group.id,
                    groupTitle: group.title,
                    taskId: task.id,
                    taskTitle: task.title,
                    color: group.color || '#0073ea',
                    search: `${task.title} ${group.title} ${board.title}`.toLowerCase(),
                })
            }
        }
    }
    return out
}
