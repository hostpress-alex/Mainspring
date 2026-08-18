/**
 * The vocabulary of an automation, on the client side.
 *
 * A deliberate mirror of `backend/api/automation/automation.engine.js`. Keeping
 * them apart means a mistake here is a sentence the interface cannot say, not
 * a rule the server carries out anyway — the server validates every rule it is
 * given and never trusts this file.
 *
 * A rule is:
 *
 *   {trigger: {type, field?, value?}, actions: [{type, field?, value?, groupId?, who?, userIds?}]}
 */
import {labelsOf} from './column.service'
export const TRIGGERS = {
    STATUS_CHANGES_TO: 'status_changes_to',
    COLUMN_CHANGES: 'column_changes',
    ITEM_CREATED: 'item_created'
}

export const ACTIONS = {
    SET_VALUE: 'set_value',
    MOVE_TO_GROUP: 'move_to_group',
    NOTIFY: 'notify'
}

/** The order the menus offer them in — most used first, as in the screenshots. */
export const TRIGGER_ORDER = [TRIGGERS.STATUS_CHANGES_TO, TRIGGERS.COLUMN_CHANGES, TRIGGERS.ITEM_CREATED]
export const ACTION_ORDER = [ACTIONS.SET_VALUE, ACTIONS.MOVE_TO_GROUP, ACTIONS.NOTIFY]

/** Columns that hold one of a fixed set of values — the ones a rule can watch. */
export const labelColumns = board => (board?.columns || [])
    .filter(c => c && (c.type === 'status' || c.type === 'priority'))

/** Every column, for "when this column changes" and for setting a value. */
export const allColumns = board => (board?.columns || []).filter(Boolean)

export function columnOf(board, field){
    return allColumns(board).find(c => String(c.field) === String(field)) || null
}

/** The values a status or priority column can take, in the board's own order. */
export function valuesOf(board, field){
    return labelsOf(board, columnOf(board, field)).map(l => l.title)
}

export function groupOf(board, groupId){
    return (board?.groups || []).find(g => String(g.id) === String(groupId)) || null
}

export const emptyRule = () => ({trigger: {type: null}, actions: []})

/**
 * Enough to be saved?
 *
 * The same questions the server asks, so the button is disabled rather than
 * the save refused. Not the same code — see the note at the top.
 */
export function isComplete(rule){
    const trigger = rule?.trigger || {}
    const actions = rule?.actions || []
    if(!actions.length) return false

    switch(trigger.type){
        case TRIGGERS.ITEM_CREATED: break
        case TRIGGERS.COLUMN_CHANGES:
            if(!trigger.field) return false
            break
        case TRIGGERS.STATUS_CHANGES_TO:
            if(!trigger.field || !trigger.value) return false
            break
        default: return false
    }

    return actions.every(action => {
        switch(action?.type){
            case ACTIONS.SET_VALUE: return Boolean(action.field) && Boolean(action.value)
            case ACTIONS.MOVE_TO_GROUP: return Boolean(action.groupId)
            case ACTIONS.NOTIFY: return action.who === 'assignees' || Boolean((action.userIds || []).length)
            default: return false
        }
    })
}
