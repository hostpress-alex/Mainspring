/**
 * Where a task lives in a URL, and how to find it in a board once it is open.
 *
 * There are two forms on purpose, and the rule between them is short:
 *
 *   /board/:boardId/:groupId/:taskId     the board, with a task open
 *   ...any page...?board=&group=&task=   a task open ON TOP of the page you
 *                                        are on
 *
 * The first is the shareable one and predates all of this. The second exists
 * because everything that links to a task from somewhere else — the calendar,
 * the search panel, the notification bell, the running timer — used to throw
 * you onto the board to show it to you. You lost the week you were looking at
 * to read one task, and getting back was your problem. The query form hangs
 * the panel off whatever is already on screen, and closing it removes three
 * parameters: same page, same scroll position, nothing reloaded.
 *
 * Query rather than a nested route per page, because a nested route would have
 * to be added to `/calendar`, then to the overview, then to the profile, and
 * would be missing from the fourth page somebody puts a task link on. This
 * works on every page there will ever be without any of them knowing about it.
 */

export const TASK_PARAMS = ['board', 'group', 'task']

/** The group segment used when the caller does not know the group.
 *  `findTaskInBoard` searches the whole board anyway. */
export const UNKNOWN_GROUP = '-'

/**
 * The task a URL names, or null.
 *
 * All three have to be there. Two out of three is a half-written link, and
 * opening "some task on that board" would be a guess.
 */
export function readTaskParams(searchParams){
    if(!searchParams) return null
    const boardId = searchParams.get('board')
    const groupId = searchParams.get('group')
    const taskId = searchParams.get('task')
    if(!boardId || !groupId || !taskId) return null
    return {boardId, groupId, taskId}
}

/** The three parameters, for `navigate({search})`. Everything else on the
 *  current URL is kept — that is the point of this form. */
export function withTaskParams(searchParams, {boardId, groupId, taskId}){
    const next = new URLSearchParams(searchParams || '')
    next.set('board', boardId)
    next.set('group', groupId || UNKNOWN_GROUP)
    next.set('task', taskId)
    return next
}

/** The same URL without the task. What closing the panel does. */
export function withoutTaskParams(searchParams){
    const next = new URLSearchParams(searchParams || '')
    for(const key of TASK_PARAMS) next.delete(key)
    return next
}

/**
 * Find the task a URL names, and the group it is REALLY in.
 *
 * The group in the link is a hint, not the answer. A link can be older than
 * the board it points into — a notification written this morning still carries
 * the group the task was in at the time, and moving the task since is enough
 * to make the link dead. Looking only in the named group meant the address bar
 * changed and nothing opened, which reads as a broken button.
 *
 * So: the named group first, then the rest of the board. The group it was
 * actually found in comes back with it, because the panel writes through that
 * id and a write into the wrong group is worse than not opening at all.
 *
 * A subtask opens the same panel a task does — it is a task, it is only listed
 * under another one. Hence the second level.
 */
export function findTaskInBoard(board, groupId, taskId){
    if(!board || !taskId) return null
    const groups = board.groups || []
    const ordered = [
        ...groups.filter(group => group.id === groupId),
        ...groups.filter(group => group.id !== groupId)
    ]
    for(const group of ordered){
        for(const task of group.tasks || []){
            if(task.id === taskId) return {task, groupId: group.id}
            const child = (task.subtasks || []).find(sub => sub.id === taskId)
            if(child) return {task: child, groupId: group.id}
        }
    }
    return null
}
