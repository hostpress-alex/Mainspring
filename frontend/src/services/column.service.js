import { t } from '../i18n'
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
    { type: 'status',   label: t('column.type.status'),   category: OVERVIEW, icon: 'status',   emptyValue: '' },
    { type: 'dropdown', label: t('column.type.dropdown'), category: OVERVIEW, icon: 'dropdown', emptyValue: '' },
    { type: 'text',     label: t('column.type.text'),     category: OVERVIEW, icon: 'text',     emptyValue: '' },
    { type: 'date',     label: t('column.type.date'),     category: OVERVIEW, icon: 'date',     emptyValue: '' },
    { type: 'person',   label: t('column.type.person'),   category: OVERVIEW, icon: 'person',   emptyValue: [] },
    { type: 'number',   label: t('column.type.number'),   category: OVERVIEW, icon: 'number',   emptyValue: '' },
    { type: 'file',     label: t('column.type.file'),     category: USEFUL,   icon: 'file',     emptyValue: '' },
    { type: 'checkbox', label: t('column.type.checkbox'), category: USEFUL,   icon: 'checkbox', emptyValue: false },
    { type: 'link',     label: t('column.type.link'),     category: USEFUL,   icon: 'link',     emptyValue: '' },
    { type: 'priority', label: t('column.type.priority'), category: USEFUL,   icon: 'priority', emptyValue: '' },
    { type: 'longtext', label: t('column.type.longtext'), category: USEFUL,   icon: 'longtext', emptyValue: '' },
    { type: 'updated',  label: t('column.type.updated'),  category: USEFUL,   icon: 'updated',  emptyValue: null },
]

// Order of the headings in the add-column dialog.
export const COLUMN_CATEGORIES = [OVERVIEW, USEFUL]

/** Altes cmpsOrder-Kuerzel -> neue Spaltendefinition. */
const LEGACY = {
    'status-picker':   { type: 'status',   field: 'status',    title: 'Status' },
    'priority-picker': { type: 'priority', field: 'priority',  title: 'Priority' },
    'member-picker':   { type: 'person',   field: 'memberIds', title: 'Person' },
    'date-picker':     { type: 'date',     field: 'dueDate',   title: 'Date' },
    'number-picker':   { type: 'number',   field: 'number',    title: 'Zahlen' },
    'file-picker':     { type: 'file',     field: 'file',      title: 'Datei' },
    'updated-picker':  { type: 'updated',  field: 'updatedBy', title: 'Zuletzt aktualisiert' },
}

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
export function makeColumnId () {
    let id = 'c_'
    for (let i = 0; i < 8; i++) id += CHARS[Math.floor(Math.random() * CHARS.length)]
    return id
}

export function catalogEntry (type) {
    return COLUMN_CATALOG.find(c => c.type === type) || null
}

/** A new column. The value lands in task[<id>], not in a fixed field. */
export function makeColumn (type, title) {
    const entry = catalogEntry(type)
    const id = makeColumnId()
    return { id, type, title: title || (entry ? entry.label : type), field: id }
}

/** Normalises `cmpOrder` entries to kebab-case (older data was inconsistent). */
function normalizeLegacy (value) {
    return String(value).replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * Makes sure board.columns exists. Idempotent — runs on every read and leaves
 * boards that have already been migrated alone.
 */
export function ensureColumns (board) {
    if (!board) return board
    if (Array.isArray(board.columns) && board.columns.length) return board

    const order = Array.isArray(board.cmpsOrder) ? board.cmpsOrder : []
    board.columns = order.map(cmp => {
        const legacy = LEGACY[normalizeLegacy(cmp)]
        if (legacy) return { id: makeColumnId(), ...legacy }
        // Unbekanntes Kuerzel: als Textspalte retten statt zu verlieren
        return { id: makeColumnId(), type: 'text', title: String(cmp), field: makeColumnId() }
    })
    return board
}

/** Read the value of a column on a task. */
export function valueOf (task, column) {
    const raw = task ? task[column.field] : undefined
    if (raw !== undefined && raw !== null) return raw
    const entry = catalogEntry(column.type)
    return entry ? entry.emptyValue : ''
}
