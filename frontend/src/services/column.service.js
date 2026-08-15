/**
 * Spaltenmodell eines Boards.
 *
 * Frueher: board.cmpsOrder = ['status-picker', 'date-picker', …]
 *   -> jeder Typ war genau einmal moeglich, weil jeder Picker ein festes Feld
 *      am Task las (task.status, task.dueDate, …). Zwei Status-Spalten oder
 *      eine umbenannte Spalte waren damit unmoeglich.
 *
 * Jetzt: board.columns = [{ id, type, title, field }]
 *   - `field` sagt, in welcher Task-Eigenschaft der Wert liegt.
 *   - Migrierte Altspalten behalten ihr angestammtes Feld (status, dueDate, …),
 *     damit Statistik, Kanban und Filter unveraendert weiterlaufen.
 *   - Neue Spalten bekommen `field = id`. Dadurch sind beliebig viele Spalten
 *     desselben Typs moeglich, ohne dass sich zwei denselben Wert teilen.
 */

export const COLUMN_CATALOG = [
    // Ueberblick
    { type: 'status',   label: 'Status',              category: 'Überblick',   icon: 'status',   emptyValue: '' },
    { type: 'dropdown', label: 'Drop-down',           category: 'Überblick',   icon: 'dropdown', emptyValue: '' },
    { type: 'text',     label: 'Text',                category: 'Überblick',   icon: 'text',     emptyValue: '' },
    { type: 'date',     label: 'Datum',               category: 'Überblick',   icon: 'date',     emptyValue: '' },
    { type: 'person',   label: 'Personen',            category: 'Überblick',   icon: 'person',   emptyValue: [] },
    { type: 'number',   label: 'Zahlen',              category: 'Überblick',   icon: 'number',   emptyValue: '' },
    // Sehr nuetzlich
    { type: 'file',     label: 'Datei',               category: 'Sehr nützlich', icon: 'file',     emptyValue: '' },
    { type: 'checkbox', label: 'Checkbox',            category: 'Sehr nützlich', icon: 'checkbox', emptyValue: false },
    { type: 'link',     label: 'Link',                category: 'Sehr nützlich', icon: 'link',     emptyValue: '' },
    { type: 'priority', label: 'Priority',            category: 'Sehr nützlich', icon: 'priority', emptyValue: '' },
    { type: 'longtext', label: 'Langer Text',         category: 'Sehr nützlich', icon: 'longtext', emptyValue: '' },
    { type: 'updated',  label: 'Zuletzt aktualisiert', category: 'Sehr nützlich', icon: 'updated',  emptyValue: null },
]

export const COLUMN_CATEGORIES = ['Überblick', 'Sehr nützlich']

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

/** Neue Spalte. Der Wert landet in task[<id>], nicht in einem festen Feld. */
export function makeColumn (type, title) {
    const entry = catalogEntry(type)
    const id = makeColumnId()
    return { id, type, title: title || (entry ? entry.label : type), field: id }
}

/** Normalisiert `cmpOrder`-Eintraege auf kebab-case (Altbestand war uneinheitlich). */
function normalizeLegacy (value) {
    return String(value).replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

/**
 * Sorgt dafuer, dass board.columns existiert. Idempotent — laeuft bei jedem
 * Lesen und veraendert bereits migrierte Boards nicht mehr.
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

/** Wert einer Spalte an einem Task lesen. */
export function valueOf (task, column) {
    const raw = task ? task[column.field] : undefined
    if (raw !== undefined && raw !== null) return raw
    const entry = catalogEntry(column.type)
    return entry ? entry.emptyValue : ''
}
