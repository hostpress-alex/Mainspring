import { httpService } from './http.service'

const BASE_URL = 'schedule/'

export const scheduleService = {
    query,
    save,
    remove,
    tasksFromBoards,
}

/** Entries that touch the period [from, to). */
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
 * A flat, searchable list of all tasks from the user's boards — the data
 * source for the task picker in the dialog.
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
