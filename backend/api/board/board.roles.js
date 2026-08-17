/**
 * Who may do what on a board.
 *
 * Every rule lives here and nowhere else. The point is not tidiness: a
 * permission that is missing does not throw — it lets the write through, and
 * nothing looks any different until somebody notices their board was renamed.
 * A rule spread across twenty call sites cannot be read in one sitting, and a
 * rule that cannot be read in one sitting cannot be checked.
 *
 * The three roles:
 *
 *   owner   the frame of the board — its name and description, its columns,
 *           its people, and every group. Plus everything an editor may do.
 *   editor  everything about tasks. May add a group, and may change or delete
 *           a group it created itself.
 *   viewer  reads everything. Writes replies to updates, and edits or deletes
 *           only its own comments. Nothing else.
 *
 * An `isAdmin` user is treated as an owner everywhere. That is a decision, not
 * an accident: an administrator who cannot repair a board is not much of an
 * administrator, and the alternative is a support request that ends in someone
 * editing the database by hand.
 */
/** Ids are compared as text everywhere in this codebase — same helper, and
 *  deliberately local so this file depends on nothing. */
const sid = v => (v === undefined || v === null)?'':String(v)

const OWNER = 'owner'
const EDITOR = 'editor'
const VIEWER = 'viewer'

const ROLES = [OWNER, EDITOR, VIEWER]

/**
 * The role this person has on this board, or null if they have none.
 *
 * `ownerIds` is consulted as well as the role, because it is what the board
 * assembly has always produced and a board read through an older path may
 * carry only that. Two sources for one answer is a smell — this one is
 * deliberate and temporary, and the day `ownerIds` goes away this is the only
 * place that has to notice.
 */
function roleOf(board, user){
    if(!board || !user) return null
    if(user.isAdmin) return OWNER

    const uid = sid(user._id)

    // ownerIds first, and not only as a tie-breaker: an id listed there counts
    // even with no member row behind it. The repo always writes both, but a
    // board assembled by an older path — or by a test — may carry only the
    // list, and an owner who cannot open their own board is the worse failure.
    if((board.ownerIds || []).map(sid).includes(uid)) return OWNER

    const member = (board.members || []).find(m => m && sid(m._id) === uid)
    if(!member) return null
    // Belt and braces. The board assembly already leaves former members out —
    // this is the second lock on the door that matters most, in case a board
    // ever reaches here from a path that does not filter.
    if(member.state && member.state !== 'active') return null
    return ROLES.includes(member.role)?member.role:EDITOR
}

const isOwner = (board, user) => roleOf(board, user) === OWNER
const isEditor = (board, user) => {
    const role = roleOf(board, user)
    return role === OWNER || role === EDITOR
}

/** May this person see the board at all? */
const canView = (board, user) => roleOf(board, user) !== null

/* ------------------------------------------------------------- groups -- */

/**
 * May this person change or delete this group?
 *
 * An editor may, if the group is theirs. `createdBy` is empty for nothing the
 * migration could reach — and an unknown creator counts as "not yours", which
 * is the safe way round: a group nobody can prove they made is the owner's.
 */
function canManageGroup(board, user, group){
    const role = roleOf(board, user)
    if(role === OWNER) return true
    if(role !== EDITOR) return false
    return Boolean(group && group.createdBy) && sid(group.createdBy) === sid(user._id)
}

/** Adding a group is open to editors; what they add is then theirs. */
const canAddGroup = (board, user) => isEditor(board, user)

/* ------------------------------------------------------------ comments -- */

/**
 * What a person may do to one comment.
 *
 * The rule that makes the whole role system awkward, and it cannot be avoided:
 * a viewer may write replies and change only their own, so a permission has to
 * be decided per comment rather than per request.
 *
 * `byMember._id` is the author. It can be missing on comments written before
 * users existed as a concept — those count as nobody's, so only an owner or
 * their own author can touch them.
 */
function canWriteComment(board, user, comment, {isNew = false} = {}){
    const role = roleOf(board, user)
    if(!role) return false

    // A viewer may only reply, never open a new thread. An editor and an owner
    // may do both.
    if(isNew && role === VIEWER && !comment?.parentId) return false
    if(isNew) return true

    if(role === OWNER || role === EDITOR) return true
    const author = comment && comment.byMember && comment.byMember._id
    return Boolean(author) && sid(author) === sid(user._id)
}

module.exports = {
    OWNER, EDITOR, VIEWER, ROLES,
    roleOf,
    isOwner,
    isEditor,
    canView,
    canManageGroup,
    canAddGroup,
    canWriteComment
}
