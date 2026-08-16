/**
 * The three roles, as the interface needs to know them.
 *
 * A deliberate copy of `backend/api/board/board.roles.js`, and the copy is the
 * point rather than a shortcut: this decides what a person is SHOWN, the
 * backend decides what a person may DO. Only one of those is a protection.
 * Keeping them apart means a mistake here is a button in the wrong place, not
 * a hole — and the two files are written in the same shape so they can be read
 * side by side.
 *
 *   owner   the frame of the board — name, description, columns, people, and
 *           every group
 *   editor  everything about tasks; may add a group, and may change or delete
 *           a group it created
 *   viewer  reads everything; writes replies, and edits or deletes only its own
 */

export const OWNER = 'owner'
export const EDITOR = 'editor'
export const VIEWER = 'viewer'
export const ROLES = [OWNER, EDITOR, VIEWER]

const sid = v => (v === undefined || v === null)?'':String(v)

export function roleOf(board, user){
    if(!board || !user) return null
    if(user.isAdmin) return OWNER

    const uid = sid(user._id)
    // ownerIds first: an id listed there counts even with no member row behind
    // it, same as on the server.
    if((board.ownerIds || []).map(sid).includes(uid)) return OWNER

    const member = (board.members || []).find(m => m && sid(m._id) === uid)
    if(!member) return null
    return ROLES.includes(member.role)?member.role:EDITOR
}

export const isOwner = (board, user) => roleOf(board, user) === OWNER

export const canEdit = (board, user) => {
    const role = roleOf(board, user)
    return role === OWNER || role === EDITOR
}

export const canView = (board, user) => roleOf(board, user) !== null

/** Adding a group is open to editors; what they add is then theirs. */
export const canAddGroup = (board, user) => canEdit(board, user)

/** Changing or deleting one is not — unless it is theirs. */
export function canManageGroup(board, user, group){
    const role = roleOf(board, user)
    if(role === OWNER) return true
    if(role !== EDITOR) return false
    return Boolean(group && group.createdBy) && sid(group.createdBy) === sid(user._id)
}

/** May this person start a new update, rather than reply to one? */
export const canStartThread = (board, user) => canEdit(board, user)

/** May this person change or delete this comment? */
export function canWriteComment(board, user, comment){
    const role = roleOf(board, user)
    if(!role) return false
    if(role === OWNER || role === EDITOR) return true
    const author = comment && comment.byMember && comment.byMember._id
    return Boolean(author) && sid(author) === sid(user._id)
}

/** What the role is called on screen. */
export const roleLabelKey = role => `role.${ROLES.includes(role)?role:EDITOR}`
