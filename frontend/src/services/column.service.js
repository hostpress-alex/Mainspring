import {t} from '../i18n'
import {priorityList} from './priority.store'

/**
 * Column model of a board.
 *
 * Before: board.cmpsOrder = ['status-picker', 'date-picker', …]
 *   -> every type was possible exactly once, because each picker read a fixed
 *      field on the task (task.status, task.dueDate, …). Two status columns or
 *      a renamed column were impossible that way.
 *
 * Now: board.columns = [{ id, type, title, field }]
 *   - `field` says which task property the value sits in.
 *   - Migrated old columns keep the field they always had (status, dueDate, …),
 *     so that statistics, kanban and filters carry on unchanged.
 *   - New columns get `field = id`. That allows any number of columns of the
 *     same type without two of them sharing the same value.
 */

const OVERVIEW = t('column.category.overview')
const USEFUL = t('column.category.useful')

export const COLUMN_CATALOG = [
    {type: 'status', label: t('column.type.status'), category: OVERVIEW, icon: 'status', emptyValue: ''},
    {type: 'dropdown', label: t('column.type.dropdown'), category: OVERVIEW, icon: 'dropdown', emptyValue: ''},
    {type: 'text', label: t('column.type.text'), category: OVERVIEW, icon: 'text', emptyValue: ''},
    {type: 'date', label: t('column.type.date'), category: OVERVIEW, icon: 'date', emptyValue: ''},
    // A date like any other to look at, and a fact to the planner: this
    // is the one the work has to be finished by. Recognised by TYPE and
    // never by its title — a title is a thing people rename.
    {type: 'deadline', label: t('column.type.deadline'), category: OVERVIEW, icon: 'deadline', emptyValue: ''},
    {type: 'person', label: t('column.type.person'), category: OVERVIEW, icon: 'person', emptyValue: []},
    {type: 'number', label: t('column.type.number'), category: OVERVIEW, icon: 'number', emptyValue: ''},
    {type: 'file', label: t('column.type.file'), category: USEFUL, icon: 'file', emptyValue: ''},
    {type: 'checkbox', label: t('column.type.checkbox'), category: USEFUL, icon: 'checkbox', emptyValue: false},
    {type: 'link', label: t('column.type.link'), category: USEFUL, icon: 'link', emptyValue: ''},
    {type: 'tags', label: t('column.type.tags'), category: USEFUL, icon: 'tags', emptyValue: []},
    {type: 'priority', label: t('column.type.priority'), category: USEFUL, icon: 'priority', emptyValue: ''},
    {type: 'estimate', label: t('column.type.estimate'), category: USEFUL, icon: 'estimate', emptyValue: ''},
    {type: 'longtext', label: t('column.type.longtext'), category: USEFUL, icon: 'longtext', emptyValue: ''},
    {type: 'updated', label: t('column.type.updated'), category: USEFUL, icon: 'updated', emptyValue: null},
    {type: 'created', label: t('column.type.created'), category: USEFUL, icon: 'created', emptyValue: null}
]

// Order of the headings in the add-column dialog.
export const COLUMN_CATEGORIES = [OVERVIEW, USEFUL]

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function makeColumnId(){
    let id = 'c_'
    for(let i = 0; i < 8; i++) id += CHARS[Math.floor(Math.random() * CHARS.length)]
    return id
}

export function catalogEntry(type){
    return COLUMN_CATALOG.find(c => c.type === type) || null
}

/**
 * Fields that are not a column value but a property of the task itself.
 *
 * A Created column does not hold anything — it shows when the row began, and
 * that is written once by the database. So it points at the task's own field
 * instead of getting a private one, and two of them on the same board show
 * the same fact rather than two empty cells.
 */
const FIXED_FIELD = {created: 'createdAt'}

/** A new column. The value lands in task[<id>], not in a fixed field. */
export function makeColumn(type, title){
    const entry = catalogEntry(type)
    const id = makeColumnId()
    return {id, type, title: title || (entry?entry.label:type), field: FIXED_FIELD[type] || id}
}

/**
 * The labels a status or priority column can take.
 *
 * Per column, with the board's own list as the fallback. A column only gets
 * its own `labels` once somebody has saved one in the label editor
 * (board.actions, setColumnLabels) — makeColumn does not seed one. Reading
 * `column.labels` alone therefore returns nothing for almost every column
 * that exists, which is how the filter and the automation builder ended up
 * offering an empty list of values while the pickers on the board showed a
 * full one.
 *
 * The four places that need this list now ask here instead of each carrying
 * their own version of the fallback.
 */
export function labelsOf(board, column){
    // Priority is not board data any more. It is one list an admin keeps, and
    // every board points into it — so nothing on the column is consulted, not
    // even if an old one still carries a `labels` array from before.
    if(column && column.type === 'priority') return priorityList()

    const own = (column && Array.isArray(column.labels))?column.labels:null
    return (own || board?.labels || []).filter(l => l && l.title)
}

/**
 * What a task stores when this label is chosen.
 *
 * Two answers, and the difference is the whole reason priorities moved: a
 * status is stored as its text, so renaming one means rewriting every task
 * that carries it. A priority is stored as an id, so renaming is one row and
 * no task is touched at all.
 *
 * Status stays on titles on purpose — those lists belong to one board, the
 * rewrite is bounded by that board, and changing it would be a second
 * migration for no gain today.
 */
export function labelKey(column, label){
    if(!label) return ''
    return (column && column.type === 'priority')?(label.id || ''):(label.title || '')
}

/** The label a stored value refers to, or null when it refers to nothing. */
export function labelFor(board, column, value){
    if(value === null || value === undefined || value === '') return null
    return labelsOf(board, column).find(l => labelKey(column, l) === value) || null
}

/**
 * The choices a column offers: what is stored, and what is shown.
 *
 * Every menu, filter and rule builder needs both halves, and the two are only
 * the same string for the types that store their text.
 */
export function labelOptions(board, column){
    return labelsOf(board, column).map(l => ({
        key: labelKey(column, l), label: l.title, color: l.color
    }))
}

/** Read the value of a column on a task. */
export function valueOf(task, column){
    const raw = task?task[column.field]:undefined
    if(raw !== undefined && raw !== null) return raw
    const entry = catalogEntry(column.type)
    return entry?entry.emptyValue:''
}
