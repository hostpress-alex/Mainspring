/**
 * Width of the right-hand task panel.
 *
 * Like the column widths, deliberately per user in localStorage and not on
 * the board: how wide someone wants the panel depends on the screen and is
 * nobody else's business.
 */
export const MIN_PANEL_WIDTH = 420
export const DEFAULT_PANEL_WIDTH = 640

const KEY = 'taskPanelWidth'

/** The upper limit follows the window — the board behind should stay visible. */
export function maxPanelWidth(){
    if(typeof window === 'undefined') return 1200
    return Math.max(MIN_PANEL_WIDTH, Math.round(window.innerWidth * 0.9))
}

export function clampPanelWidth(value){
    const n = Number(value)
    if(!Number.isFinite(n)) return DEFAULT_PANEL_WIDTH
    return Math.min(maxPanelWidth(), Math.max(MIN_PANEL_WIDTH, Math.round(n)))
}

export function loadPanelWidth(){
    try {
        const raw = localStorage.getItem(KEY)
        if(raw === null) return DEFAULT_PANEL_WIDTH
        return clampPanelWidth(raw)
    } catch(err) {
        return DEFAULT_PANEL_WIDTH
    }
}

export function savePanelWidth(value){
    try {
        localStorage.setItem(KEY, String(clampPanelWidth(value)))
    } catch(err) {
        // No localStorage (private window) — then just for this session.
    }
}
