/**
 * Which groups a user has folded away.
 *
 * Per user in localStorage, like the column widths next door: folding a group
 * is a matter of view. If it were stored on the board, one person tidying up
 * their screen would fold the group away for everyone.
 */
const keyOf = boardId => `collapsedGroups:${boardId}`

export function loadCollapsed(boardId){
    if(!boardId) return []
    try {
        const stored = JSON.parse(localStorage.getItem(keyOf(boardId)))
        return Array.isArray(stored)?stored:[]
    } catch {
        return []
    }
}

export function isCollapsed(boardId, groupId){
    return loadCollapsed(boardId).includes(groupId)
}

/** Returns the new state, so the caller does not have to read it back. */
export function toggleCollapsed(boardId, groupId){
    const open = loadCollapsed(boardId)
    const next = open.includes(groupId)
        ?open.filter(id => id !== groupId)
        :[...open, groupId]
    try {
        localStorage.setItem(keyOf(boardId), JSON.stringify(next))
    } catch { /* private mode, say — then it just does not survive a reload */
    }
    return next.includes(groupId)
}
