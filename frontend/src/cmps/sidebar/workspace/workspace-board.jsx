import { useMemo, useState } from 'react'
import { AiOutlinePlus, AiOutlineSearch, AiOutlineStar } from 'react-icons/ai'
import { MdKeyboardArrowDown, MdKeyboardArrowRight } from 'react-icons/md'
import { BoardPreview } from '../../board/board-preview'

export const NO_FOLDER = 'Ohne Gruppe'

/**
 * Board-Spalte der Seitenleiste.
 *
 * Die Workspace-Auswahl ("Sprint 4") ist entfallen — es gibt nur einen
 * Workspace. Stattdessen: ein Favoriten-Abschnitt und darunter die Boards
 * nach `board.folder` gruppiert (z.B. "IT", "Marketing").
 */
export default function WorkspaceBoard ({ handleChange, filterByToEdit, setIsCreateModalOpen, boards = [] }) {
    const [collapsed, setCollapsed] = useState({})

    const starred = useMemo(() => boards.filter(b => b.isStarred), [boards])

    /** Boards nach Ordner gruppieren; Ordner alphabetisch, "Ohne Gruppe" zuletzt. */
    const folders = useMemo(() => {
        const map = new Map()
        for (const board of boards) {
            const key = (board.folder || '').trim() || NO_FOLDER
            if (!map.has(key)) map.set(key, [])
            map.get(key).push(board)
        }
        return [...map.entries()].sort(([a], [b]) => {
            if (a === NO_FOLDER) return 1
            if (b === NO_FOLDER) return -1
            return a.localeCompare(b, 'de')
        })
    }, [boards])

    const toggle = key => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

    function Section ({ id, title, icon, list }) {
        const isCollapsed = collapsed[id]
        return (
            <li className='workspace-section'>
                <div className='workspace-section-head' onClick={() => toggle(id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                        padding: '7px 8px 5px', color: '#676879', fontSize: 13 }}>
                    {isCollapsed ? <MdKeyboardArrowRight /> : <MdKeyboardArrowDown />}
                    {icon}
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {title}
                    </span>
                    <span style={{ fontSize: 12, opacity: .8 }}>{list.length}</span>
                </div>
                {!isCollapsed && (
                    <ul className='board-list-container flex column'>
                        {list.map(board => (
                            <li key={board._id} className='board-list'>
                                <BoardPreview board={board} />
                            </li>
                        ))}
                        {!list.length && (
                            <li style={{ padding: '4px 12px 8px', color: '#9699a6', fontSize: 12 }}>
                                Noch nichts hier
                            </li>
                        )}
                    </ul>
                )}
            </li>
        )
    }

    return (
        <div className="workspace-sidebar-header">
            <div className='workspace-sidebar-items'>
                <div className="workspace-title-container flex space-between align-center">
                    <span className='workspace-title'>Boards</span>
                </div>
                <div className='workspace-btns'>
                    <div onClick={() => setIsCreateModalOpen((prev) => !prev)}>
                        <AiOutlinePlus className='icon' />
                        <span>Hinzufügen</span>
                    </div>
                    <div className='search-board'>
                        <div className='flex'>
                            <AiOutlineSearch className='icon' />
                            <input type="text"
                                name='title'
                                className='search-input'
                                value={filterByToEdit.title}
                                placeholder="Suchen"
                                onChange={handleChange}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <ul className='board-list-container flex column'>
                <Section id='__fav' title='Favoriten' list={starred}
                    icon={<AiOutlineStar style={{ color: '#fdab3d' }} />} />
                {folders.map(([name, list]) => (
                    <Section key={name} id={name} title={name} list={list} icon={null} />
                ))}
            </ul>
        </div>
    )
}
