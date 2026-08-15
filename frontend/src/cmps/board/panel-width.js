/**
 * Breite des rechten Task-Fensters.
 *
 * Wie die Spaltenbreiten bewusst pro Benutzer im localStorage und nicht am
 * Board: wie breit jemand das Fenster haben will, haengt am Bildschirm und
 * geht die anderen nichts an.
 */
export const MIN_PANEL_WIDTH = 420
export const DEFAULT_PANEL_WIDTH = 640

const KEY = 'taskPanelWidth'

/** Obergrenze richtet sich nach dem Fenster — das Board dahinter soll sichtbar bleiben. */
export function maxPanelWidth () {
    if (typeof window === 'undefined') return 1200
    return Math.max(MIN_PANEL_WIDTH, Math.round(window.innerWidth * 0.9))
}

export function clampPanelWidth (value) {
    const n = Number(value)
    if (!Number.isFinite(n)) return DEFAULT_PANEL_WIDTH
    return Math.min(maxPanelWidth(), Math.max(MIN_PANEL_WIDTH, Math.round(n)))
}

export function loadPanelWidth () {
    try {
        const raw = localStorage.getItem(KEY)
        if (raw === null) return DEFAULT_PANEL_WIDTH
        return clampPanelWidth(raw)
    } catch (err) {
        return DEFAULT_PANEL_WIDTH
    }
}

export function savePanelWidth (value) {
    try {
        localStorage.setItem(KEY, String(clampPanelWidth(value)))
    } catch (err) {
        // Kein localStorage (privates Fenster) — dann eben nur fuer diese Sitzung.
    }
}
