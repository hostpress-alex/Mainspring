/**
 * The tabs across the top of a board.
 *
 * A tab is a way of looking at the board: which rows (the filter rules) and
 * which drawing (table, kanban, dashboard). The three that were fixed buttons
 * are now tabs like any other — they simply are not stored anywhere, because
 * "the whole board as a table" needs no row in a database.
 *
 * Everything here is pure or talks to localStorage. What a tab may do is
 * decided on the server; the checks below only decide what is worth drawing.
 */
import {t} from '../i18n'
import {MODE_ALL} from './board-filter'
import * as boardRoles from './board-roles'
import {utilService} from './util.service'

export const DISPLAYS = ['table', 'kanban', 'dashboard']

export const DISPLAY_ICON = {
    table: 'house',
    kanban: 'table-columns',
    dashboard: 'chart-column'
}

/**
 * Built anew on every call rather than kept in a constant: the titles are
 * translated, and a constant would be translated once, at import time, into
 * whichever language happened to be loaded then.
 */
export function builtinTabs(){
    return DISPLAYS.map(display => ({
        id: display,
        title: t(`board.${display}`),
        display,
        rules: [],
        mode: MODE_ALL,
        builtin: true
    }))
}

/** The three built-in ones, then the saved ones in the order they were made. */
export function tabsOf(views){
    // Array.isArray, not `views || []`: a server answer that is not a list —
    // an error page from a proxy, say — would otherwise reach .filter and
    // throw during render, which is a white page instead of a missing tab.
    const saved = Array.isArray(views)?views:[]
    return [
        ...builtinTabs(),
        ...saved.filter(Boolean).map(view => ({...view, builtin: false}))
    ]
}

export function findTab(tabs, id){
    return tabs.find(tab => String(tab.id) === String(id)) || tabs[0]
}

/**
 * May this person rename, update or delete this tab?
 *
 * A mirror of _requireOwnView on the server, and only a mirror: it decides
 * whether to draw the menu, never whether the change goes through. An owner
 * may clear up the shared tabs; a private tab belongs to whoever made it and
 * to nobody else.
 */
export function canManageTab(tab, board, me){
    if(!tab || tab.builtin || !me) return false
    if(tab.createdBy && String(tab.createdBy) === String(me._id)) return true
    return tab.visibility === 'board' && boardRoles.isOwner(board, me)
}

/** Sharing a tab with the board is an edit to the board. */
export function canShareTab(board, me){
    return boardRoles.canEdit(board, me)
}

/* ------------------------------------------ Der offene Reiter -- */

const ACTIVE_KEY = 'boardActiveView'

/**
 * Which tab a board was left on.
 *
 * Per board and in the browser. It used to be plain useState, which meant
 * every reload dropped you back on the table — on a board whose real work
 * happens in the kanban that is a small daily annoyance with no cause the
 * user can see.
 */
export function loadActiveTab(boardId){
    const all = utilService.loadFromStorage(ACTIVE_KEY) || {}
    const id = all[boardId]
    return (typeof id === 'string' && id)?id:'table'
}

export function saveActiveTab(boardId, tabId){
    if(!boardId) return
    const all = utilService.loadFromStorage(ACTIVE_KEY) || {}
    if(!tabId || tabId === 'table') delete all[boardId]
    else all[boardId] = String(tabId)
    utilService.saveToStorage(ACTIVE_KEY, all)
}

/** A tab that has been deleted, or shared and then unshared, is gone. */
export function forgetTab(boardId, tabId){
    const all = utilService.loadFromStorage(ACTIVE_KEY) || {}
    if(all[boardId] === String(tabId)){
        delete all[boardId]
        utilService.saveToStorage(ACTIVE_KEY, all)
    }
}
