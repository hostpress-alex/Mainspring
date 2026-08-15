/**
 * Spaltenbreiten. Bewusst pro Benutzer im localStorage, nicht am Board —
 * die Breite ist Ansichtssache und soll nicht fuer alle gelten.
 *
 * Frueher kamen die Breiten aus SCSS-Klassen (.member-picker & Co). Das brach,
 * sobald Spalten frei benennbar wurden und neue Typen dazukamen: die Kopfzeile
 * bekam eine andere Klasse als die Zelle und beides lief auseinander.
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
    } catch { /* localStorage voll oder gesperrt — Breite ist dann nur temporaer */ }
}

export function widthOf (widths, column) {
    const stored = widths?.[column?.id]
    const value = Number.isFinite(stored) ? stored : defaultWidth(column)
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value))
}

/** Feste Breite als Inline-Style — schlaegt jede SCSS-Regel. */
export function widthStyle (px) {
    return { width: px, minWidth: px, maxWidth: px, flex: `0 0 ${px}px` }
}
