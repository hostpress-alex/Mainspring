/**
 * Column widths. Deliberately per user in localStorage, not on the board —
 * the width is a matter of view and should not apply to everyone.
 *
 * The widths used to come from SCSS classes (.member-picker & co). That broke
 * as soon as columns became freely nameable and new types came along: the
 * header row got a different class than the cell and the two drifted apart.
 */
import {useState, useEffect} from 'react'

export const MIN_WIDTH = 70
export const MAX_WIDTH = 600

/**
 * The task title is not a column out of `board.columns` — it is part of the
 * table's frame. It still gets dragged like every other column, so it joins
 * the same width system under an id of its own.
 */
export const TASK_COLUMN = {id: '__task', type: 'task'}

const TYPE_WIDTHS = {
    task: 336,
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
    file: 110
}

const keyOf = boardId => `colWidths:${boardId}`

export function defaultWidth(column){
    return TYPE_WIDTHS[column?.type] ?? 140
}

export function loadWidths(boardId){
    if(!boardId) return {}
    try {
        return JSON.parse(localStorage.getItem(keyOf(boardId))) || {}
    } catch {
        return {}
    }
}

export function saveWidths(boardId, widths){
    if(!boardId) return
    try {
        localStorage.setItem(keyOf(boardId), JSON.stringify(widths))
    } catch { /* localStorage full or locked — the width is then only temporary */
    }
}

export function widthOf(widths, column){
    const stored = widths?.[column?.id]
    const value = Number.isFinite(stored)?stored:defaultWidth(column)
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value))
}

/** Fixed width as an inline style — beats any SCSS rule. */
export function widthStyle(px){
    return {width: px, minWidth: px, maxWidth: px, flex: `0 0 ${px}px`}
}

/**
 * One width store per board.
 *
 * Every group renders its own header row, so the widths must not live inside
 * one of those components: dragging in the first group would leave the second
 * one at the old width until the next reload. The store keeps them in step,
 * writes to localStorage only when the mouse is released, and hands the rest
 * out through `useColumnWidths`.
 */
const cache = new Map()
const listeners = new Set()

function widthsOfBoard(boardId){
    if(!cache.has(boardId)) cache.set(boardId, loadWidths(boardId))
    return cache.get(boardId)
}

/** Set one column live — every group redraws, nothing is written yet. */
export function setWidth(boardId, columnId, px){
    if(!boardId) return
    cache.set(boardId, {...widthsOfBoard(boardId), [columnId]: px})
    listeners.forEach(notify => notify(boardId))
}

/** End of the drag: now it may go to localStorage. */
export function commitWidths(boardId){
    if(!boardId) return
    saveWidths(boardId, widthsOfBoard(boardId))
}

export function useColumnWidths(boardId){
    const [widths, setLocal] = useState(() => widthsOfBoard(boardId))
    useEffect(() => {
        setLocal(widthsOfBoard(boardId))

        function notify(changedBoardId){
            if(changedBoardId === boardId) setLocal(widthsOfBoard(boardId))
        }

        listeners.add(notify)
        return () => {
            listeners.delete(notify)
        }
    }, [boardId])
    return widths
}
