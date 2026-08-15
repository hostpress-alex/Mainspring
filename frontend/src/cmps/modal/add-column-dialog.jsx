import { useEffect, useMemo, useRef, useState } from 'react'
import {
    MdOutlineViewWeek, MdArrowDropDownCircle, MdOutlineTextFields, MdOutlineCalendarMonth,
    MdOutlinePerson, MdOutlineNumbers, MdOutlineInsertDriveFile, MdOutlineCheckBox,
    MdOutlineLink, MdOutlineFlag, MdOutlineNotes, MdOutlineUpdate,
} from 'react-icons/md'
import { COLUMN_CATALOG, COLUMN_CATEGORIES, makeColumn } from '../../services/column.service'
import './add-column-dialog.css'

const ICONS = {
    status:   { el: <MdOutlineViewWeek />,        bg: '#00c875' },
    dropdown: { el: <MdArrowDropDownCircle />,    bg: '#00a9a5' },
    text:     { el: <MdOutlineTextFields />,      bg: '#fdab3d' },
    date:     { el: <MdOutlineCalendarMonth />,   bg: '#a25ddc' },
    person:   { el: <MdOutlinePerson />,          bg: '#41b0f5' },
    number:   { el: <MdOutlineNumbers />,         bg: '#ffcb00' },
    file:     { el: <MdOutlineInsertDriveFile />, bg: '#e2445c' },
    checkbox: { el: <MdOutlineCheckBox />,        bg: '#fdab3d' },
    link:     { el: <MdOutlineLink />,            bg: '#0073ea' },
    priority: { el: <MdOutlineFlag />,            bg: '#ffcb00' },
    longtext: { el: <MdOutlineNotes />,           bg: '#7f5347' },
    updated:  { el: <MdOutlineUpdate />,          bg: '#9d99b9' },
}

/**
 * Spaltenauswahl nach Vorbild von monday: Suche, Kategorien, ein Klick legt an.
 * Optional laesst sich vorher ein eigener Titel setzen — sonst nimmt die Spalte
 * den Namen ihres Typs. Derselbe Typ darf beliebig oft vorkommen.
 */
export function AddColumnDialog ({ onAdd, onClose, existingTitles = [] }) {
    const [filter, setFilter] = useState('')
    const [title, setTitle] = useState('')
    const elSearch = useRef()

    useEffect(() => {
        elSearch.current?.focus()
        const onKey = ev => { if (ev.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    const matches = useMemo(() => {
        const q = filter.trim().toLowerCase()
        if (!q) return COLUMN_CATALOG
        return COLUMN_CATALOG.filter(c =>
            c.label.toLowerCase().includes(q) || c.type.includes(q))
    }, [filter])

    /** Doppelte Titel vermeiden: "Text", "Text 2", "Text 3" … */
    function uniqueTitle (base) {
        if (!existingTitles.includes(base)) return base
        let n = 2
        while (existingTitles.includes(`${base} ${n}`)) n++
        return `${base} ${n}`
    }

    function pick (type, label) {
        const wanted = title.trim() || label
        onAdd(makeColumn(type, uniqueTitle(wanted)))
    }

    return (
        <div className='acd-backdrop' onMouseDown={ev => { if (ev.target === ev.currentTarget) onClose() }}>
            <div className='acd' role='dialog' aria-label='Spalte hinzufügen'>
                <div className='acd-head'>
                    <h2>Spalte hinzufügen</h2>
                    <button className='acd-close' onClick={onClose} aria-label='Schließen'>×</button>
                </div>

                <div className='acd-search'>
                    <input ref={elSearch} value={filter} placeholder='Spalte suchen…'
                        onChange={e => setFilter(e.target.value)} />
                </div>

                <div className='acd-body'>
                    {!matches.length && <p className='acd-empty'>Kein Spaltentyp passt zu „{filter}".</p>}
                    {COLUMN_CATEGORIES.map(cat => {
                        const items = matches.filter(c => c.category === cat)
                        if (!items.length) return null
                        return (
                            <div key={cat}>
                                <div className='acd-cat'>{cat}</div>
                                <div className='acd-grid'>
                                    {items.map(c => {
                                        const icon = ICONS[c.icon] || ICONS.text
                                        return (
                                            <button type='button' className='acd-item' key={c.type}
                                                onClick={() => pick(c.type, c.label)}>
                                                <span className='acd-icon' style={{ background: icon.bg }}>{icon.el}</span>
                                                <span>{c.label}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div className='acd-foot'>
                    <label className='acd-name'>
                        <span className='acd-hint'>Eigener Name</span>
                        <input value={title} placeholder='optional' onChange={e => setTitle(e.target.value)} />
                    </label>
                    <span className='acd-hint'>Titel später per Doppelklick auf den Spaltenkopf änderbar</span>
                </div>
            </div>
        </div>
    )
}
