/**
 * What a rule means. No database, no request, no side effect.
 *
 * Everything here answers one of three questions:
 *
 *   does this rule apply to what just happened?   matches()
 *   what would it do, and what is already true?   plan()
 *   is this rule even sayable on this board?      validate()
 *
 * Kept pure so the awkward parts — a rule that fires on its own effect, an
 * action that would write the value it just read — can be checked in a test
 * without a board, a socket or a login.
 *
 * The vocabulary is deliberately small. Every trigger and every action here
 * exists in the interface; there is no half-supported type that the sentence
 * builder cannot say.
 */
const TRIGGERS = {
    /** A status/priority column takes one particular value. */
    STATUS_CHANGES_TO: 'status_changes_to',
    /** Any change to one named column, whatever the new value. */
    COLUMN_CHANGES: 'column_changes',
    /** A task was added to the board. */
    ITEM_CREATED: 'item_created'
}

const ACTIONS = {
    SET_VALUE: 'set_value',
    MOVE_TO_GROUP: 'move_to_group',
    NOTIFY: 'notify'
}

const sid = v => (v === undefined || v === null)?'':String(v)

/* --------------------------------------------------------------- match -- */

/**
 * Does this rule apply?
 *
 * `event` is what the board service already knows at the moment of a write:
 *
 *   {kind: 'created' | 'changed', groupId, task, changes: [{field, from, to}]}
 *
 * `changes` is the same shape the notifications use, and for the same reason:
 * a patch that sets a field to the value it already had is not a change, and a
 * rule must not fire on it. Otherwise saving a task twice runs every rule
 * twice.
 */
function matches(automation, event){
    if(!automation || automation.enabled === false || !event) return false
    const trigger = automation.trigger || {}
    const changes = Array.isArray(event.changes)?event.changes:[]

    switch(trigger.type){
        case TRIGGERS.ITEM_CREATED:
            return event.kind === 'created'

        case TRIGGERS.COLUMN_CHANGES:
            return event.kind === 'changed'
                && changes.some(c => c && sid(c.field) === sid(trigger.field))

        case TRIGGERS.STATUS_CHANGES_TO:
            return event.kind === 'changed'
                && changes.some(c => c && sid(c.field) === sid(trigger.field)
                    && sid(c.to) === sid(trigger.value))

        default:
            // An unknown trigger never fires. A rule written by a newer version
            // of the application must not do something arbitrary here.
            return false
    }
}

/* ---------------------------------------------------------------- plan -- */

/**
 * What the rule would do, and what is already the case.
 *
 * Every entry comes back with a `skip` reason or without one. The skipping is
 * not politeness — it is half of the loop protection. Two rules that set each
 * other's column would otherwise write forever; because the second write is a
 * no-op it is never made, and no event is raised.
 */
function plan(automation, event){
    const task = event.task || {}
    return (automation.actions || []).filter(Boolean).map(action => {
        switch(action.type){
            case ACTIONS.SET_VALUE:
                if(!action.field) return {action, skip: 'incomplete'}
                if(sid(task[action.field]) === sid(action.value)) return {action, skip: 'unchanged'}
                return {action}

            case ACTIONS.MOVE_TO_GROUP:
                if(!action.groupId) return {action, skip: 'incomplete'}
                if(sid(event.groupId) === sid(action.groupId)) return {action, skip: 'unchanged'}
                return {action}

            case ACTIONS.NOTIFY:
                if(!recipientsOf(action, task).length) return {action, skip: 'nobody'}
                return {action}

            default:
                return {action, skip: 'unknown'}
        }
    })
}

/**
 * Who a notify action reaches.
 *
 * `assignees` rather than a fixed list is the useful case — "tell whoever has
 * this task" keeps working when the task changes hands.
 */
function recipientsOf(action, task){
    if(action.who === 'assignees') return (task.memberIds || []).map(sid).filter(Boolean)
    return [...new Set((action.userIds || []).map(sid).filter(Boolean))]
}

/**
 * What actually changed, in the shape `matches` wants.
 *
 * Only the board's own columns: a patch also carries titles, members, comments
 * and subtasks, and none of those are things a rule can watch in this version.
 * A key whose value is what it already was is not a change — the frontend
 * resends whole objects, and without this every save would look like an edit
 * of everything.
 */
function changesOf(patch, oldTask, columns){
    if(!patch || typeof patch !== 'object') return []
    const fields = new Set((Array.isArray(columns)?columns:[])
        .filter(Boolean).map(c => sid(c.field)))

    const out = []
    for(const [field, to] of Object.entries(patch)){
        if(!fields.has(sid(field))) continue
        const from = oldTask?oldTask[field]:undefined
        if(sid(from) === sid(to)) continue
        out.push({field, from: from ?? null, to: to ?? null})
    }
    return out
}

/* ------------------------------------------------------------ validate -- */

/**
 * Can this rule be said on this board?
 *
 * Checked when it is written, not when it runs. A rule pointing at a column
 * that does not exist is a typo somebody can still fix; the same rule failing
 * silently three weeks later at two in the morning is not.
 *
 * Returns a list of complaints, empty when the rule is sound.
 */
function validate(automation, board){
    const problems = []
    const trigger = (automation && automation.trigger) || {}
    const actions = (automation && automation.actions) || []
    const columns = (board && board.columns) || []
    const groups = (board && board.groups) || []

    const fieldExists = field => columns.some(c => c && sid(c.field) === sid(field))
    const groupExists = id => groups.some(g => g && sid(g.id) === sid(id))

    if(!Object.values(TRIGGERS).includes(trigger.type)){
        problems.push('Unknown trigger')
    }
    if(trigger.type === TRIGGERS.STATUS_CHANGES_TO || trigger.type === TRIGGERS.COLUMN_CHANGES){
        if(!fieldExists(trigger.field)) problems.push('The trigger points at a column that does not exist')
    }
    if(trigger.type === TRIGGERS.STATUS_CHANGES_TO && !sid(trigger.value)){
        problems.push('The trigger has no value')
    }

    if(!Array.isArray(actions) || !actions.length) problems.push('A rule without an action does nothing')

    for(const action of actions){
        switch(action && action.type){
            case ACTIONS.SET_VALUE:
                if(!fieldExists(action.field)) problems.push('An action points at a column that does not exist')
                break
            case ACTIONS.MOVE_TO_GROUP:
                if(!groupExists(action.groupId)) problems.push('An action points at a group that does not exist')
                break
            case ACTIONS.NOTIFY:
                if(action.who !== 'assignees' && !(action.userIds || []).length){
                    problems.push('A notification without a recipient')
                }
                break
            default:
                problems.push('Unknown action')
        }
    }
    return problems
}

/* ------------------------------------------------------------- reading -- */

/**
 * One line for the run log, built from the board's own words.
 *
 * Titles of columns, labels and groups rather than ids, so the log stays
 * readable in either language without going through the text catalogue — this
 * is the user's own data, not interface wording.
 */
function describeAction(action, board){
    const column = ((board && board.columns) || []).find(c => c && sid(c.field) === sid(action.field))
    const group = ((board && board.groups) || []).find(g => g && sid(g.id) === sid(action.groupId))
    switch(action.type){
        case ACTIONS.SET_VALUE: return `${(column && column.title) || action.field} = ${action.value}`
        case ACTIONS.MOVE_TO_GROUP: return `→ ${(group && group.title) || action.groupId}`
        case ACTIONS.NOTIFY: return '✉'
        default: return action.type
    }
}

module.exports = {TRIGGERS, ACTIONS, matches, plan, validate, recipientsOf, describeAction, changesOf}
