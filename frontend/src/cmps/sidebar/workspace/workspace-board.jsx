import {useMemo, useState} from 'react'
import {useLocation, useParams} from 'react-router-dom'
import { Icon } from '../../icon'
import {BoardPreview} from '../../board/board-preview'
import {t} from '../../../i18n'

export const NO_FOLDER = t('group.none')

/** Section id of the favourites list — not a folder name. */
const FAVOURITES = '__fav'

/**
 * Board column of the sidebar.
 *
 * The workspace picker ("Sprint 4") is gone — there is only one workspace.
 * Instead: a favourites section and below it the boards grouped by
 * `board.folder` (e.g. "IT", "Marketing").
 */
export default function WorkspaceBoard({handleChange, filterByToEdit, setIsCreateModalOpen, boards = []}){
    const [collapsed, setCollapsed] = useState({})
    const {boardId} = useParams()
    const location = useLocation()

    /**
     * The section the open board counts as active in.
     *
     * Normally the one it was clicked in. Opened without that — a direct link,
     * a jump from the overview — the board's own folder wins, not favourites.
     */
    const activeSection = useMemo(() => {
        if(!boardId) return null
        const open = boards.find(b => b._id === boardId)
        if(!open) return null
        const home = (open.folder || '').trim() || NO_FOLDER
        // Favourites only count while the board really is one — un-starring it
        // while it is open would otherwise leave nothing marked at all.
        if(location.state?.sidebarSection === FAVOURITES) return open.isStarred?FAVOURITES:home
        return home
    }, [boardId, location.state, boards])

    const starred = useMemo(() => boards.filter(b => b.isStarred), [boards])

    /** Group boards by folder; folders alphabetically, "no folder" last. */
    const folders = useMemo(() => {
        const map = new Map()
        for(const board of boards){
            const key = (board.folder || '').trim() || NO_FOLDER
            if(!map.has(key)) map.set(key, [])
            map.get(key).push(board)
        }
        return [...map.entries()].sort(([a], [b]) => {
            if(a === NO_FOLDER) return 1
            if(b === NO_FOLDER) return -1
            return a.localeCompare(b, 'de')
        })
    }, [boards])

    const toggle = key => setCollapsed(prev => ({...prev, [key]: !prev[key]}))

    function Section({id, title, icon, list}){
        const isCollapsed = collapsed[id]
        return (
            <li className="workspace-section">
                <div className="workspace-section-head" onClick={() => toggle(id)}>
                    {isCollapsed?<Icon name='chevron-right'/>:<Icon name='chevron-down'/>}
                    {icon}
                    <span className="workspace-section-name">
                        {title}
                    </span>
                    <span className="workspace-section-count">{list.length}</span>
                </div>
                {!isCollapsed && (
                    <ul className="board-list-container flex column">
                        {list.map(board => (
                            <li key={board._id} className="board-list">
                                <BoardPreview board={board} sectionId={id} isActive={board._id === boardId && id === activeSection}/>
                            </li>
                        ))}
                        {!list.length && (
                            <li className="workspace-section-empty">
                                {t('board.empty')}
                            </li>
                        )}
                    </ul>
                )}
            </li>
        )
    }

    return (
        <div className="workspace-sidebar-header">
            <div className="workspace-sidebar-items">
                <div className="workspace-title-container flex space-between align-center">
                    <span className="workspace-title">{t('nav.boards')}</span>
                </div>
                <div className="workspace-btns">
                    <div onClick={() => setIsCreateModalOpen((prev) => !prev)}>
                        <Icon name='plus' className="icon"/>
                        <span>{t('common.add')}</span>
                    </div>
                    <div className="search-board">
                        <div className="flex">
                            <Icon name='magnifying-glass' className="icon"/>
                            <input type="text" name="title" className="search-input" value={filterByToEdit.title} placeholder={t('common.search')} onChange={handleChange}/>
                        </div>
                    </div>
                </div>
            </div>

            <ul className="board-list-container flex column">
                <Section id={FAVOURITES} title={t('board.favorites')} list={starred} icon={
                    <Icon name='star' variant='fa-regular' className="workspace-star"/>}/>
                {folders.map(([name, list]) => (
                    <Section key={name} id={name} title={name} list={list} icon={null}/>
                ))}
            </ul>
        </div>
    )
}
