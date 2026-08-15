/**
 * Column widths. Deliberately per user in localStorage, not on the board —
 * the width is a matter of view and should not apply to everyone.
 *
 * The widths used to come from SCSS classes (.member-picker & co). That broke
 * as soon as columns became freely nameable and new types came along: the
 * header row got a different class than the cell and the two drifted apart.
 */
export const MIN_WIDTH = 70
export const MAX_WIDTH = 600

const TYPE_WIDTHS = {
    person: 87,
    checkbox: 90,
    number: 110,
    status: 140,
    priority: 140,
    date: 140,
    updated: 140,
    dropdown: 160,
    link: 180,
    text: 180,
    longtext: 220,
    file: 110,
}

const keyOf = boardId => `colWidths:${boardId}`

export function defaultWidth (column) {
    return TYPE_WIDTHS[column?.type] ?? 140
}

export function loadWidths (boardId) {
    if (!boardId) return {}
    try {
        return JSON.parse(localStorage.getItem(keyOf(boardId))) || {}
    } catch {
        return {}
    }
}

export function saveWidths (boardId, widths) {
    if (!boardId) return
    try {
        localStorage.setItem(keyOf(boardId), JSON.stringify(widths))
    } catch { /* localStorage full or locked — the width is then only temporary */ }
}

export function widthOf (widths, column) {
    const stored = widths?.[column?.id]
    const value = Number.isFinite(stored) ? stored : defaultWidth(column)
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value))
}

/** Fixed width as an inline style — beats any SCSS rule. */
export function widthStyle (px) {
    return { width: px, minWidth: px, maxWidth: px, flex: `0 0 ${px}px` }
}
