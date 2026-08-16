import {useEffect, useMemo, useRef, useState} from 'react'
import { Icon } from '../icon'
import {COLUMN_CATALOG, COLUMN_CATEGORIES, makeColumn} from '../../services/column.service'
import './add-column-dialog.css'
import {t} from '../../i18n'

const ICONS = {
    status: {el: <Icon name='table-columns'/>, bg: '#00c875'},
    dropdown: {el: <Icon name='circle-chevron-down'/>, bg: '#00a9a5'},
    text: {el: <Icon name='font'/>, bg: '#fdab3d'},
    date: {el: <Icon name='calendar-days' style='fa-regular'/>, bg: '#a25ddc'},
    person: {el: <Icon name='user' style='fa-regular'/>, bg: '#41b0f5'},
    number: {el: <Icon name='hashtag'/>, bg: '#ffcb00'},
    file: {el: <Icon name='file' style='fa-regular'/>, bg: '#e2445c'},
    checkbox: {el: <Icon name='square-check' style='fa-regular'/>, bg: '#fdab3d'},
    link: {el: <Icon name='link'/>, bg: '#0073ea'},
    priority: {el: <Icon name='flag' style='fa-regular'/>, bg: '#ffcb00'},
    longtext: {el: <Icon name='align-left'/>, bg: '#7f5347'},
    updated: {el: <Icon name='clock-rotate-left'/>, bg: '#9d99b9'}
}

/**
 * Column picker modelled on monday: search, categories, one click creates it.
 * You can optionally set your own title first — otherwise the column takes the
 * name of its type. The same type may occur as often as you like.
 */
export function AddColumnDialog({onAdd, onClose, existingTitles = []}){
    const [filter, setFilter] = useState('')
    const [title, setTitle] = useState('')
    const elSearch = useRef()

    useEffect(() => {
        elSearch.current?.focus()
        const onKey = ev => {
            if(ev.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    const matches = useMemo(() => {
        const q = filter.trim().toLowerCase()
        if(!q) return COLUMN_CATALOG
        return COLUMN_CATALOG.filter(c =>
            c.label.toLowerCase().includes(q) || c.type.includes(q))
    }, [filter])

    /** Avoid duplicate titles: "Text", "Text 2", "Text 3" … */
    function uniqueTitle(base){
        if(!existingTitles.includes(base)) return base
        let n = 2
        while(existingTitles.includes(`${base} ${n}`)) n++
        return `${base} ${n}`
    }

    function pick(type, label){
        const wanted = title.trim() || label
        onAdd(makeColumn(type, uniqueTitle(wanted)))
    }

    return (
        <div className="acd-backdrop" onMouseDown={ev => {
            if(ev.target === ev.currentTarget) onClose()
        }}>
            <div className="acd" role="dialog" aria-label={t('column.add')}>
                <div className="acd-head">
                    <h2>{t('column.add')}</h2>
                    <button className="acd-close" onClick={onClose} aria-label={t('common.close')}>×</button>
                </div>

                <div className="acd-search">
                    <input ref={elSearch} value={filter} placeholder={t('column.search')} onChange={e => setFilter(e.target.value)}/>
                </div>

                <div className="acd-body">
                    {!matches.length && <p className="acd-empty">Kein Spaltentyp passt zu „{filter}".</p>}
                    {COLUMN_CATEGORIES.map(cat => {
                        const items = matches.filter(c => c.category === cat)
                        if(!items.length) return null
                        return (
                            <div key={cat}>
                                <div className="acd-cat">{cat}</div>
                                <div className="acd-grid">
                                    {items.map(c => {
                                        const icon = ICONS[c.icon] || ICONS.text
                                        return (
                                            <button type="button" className="acd-item" key={c.type} onClick={() => pick(c.type, c.label)}>
                                                <span className="acd-icon" style={{'--icon-bg': icon.bg}}>{icon.el}</span>
                                                <span>{c.label}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>

                <div className="acd-foot">
                    <label className="acd-name">
                        <span className="acd-hint">{t('column.customName')}</span>
                        <input value={title} placeholder={t('common.optional')} onChange={e => setTitle(e.target.value)}/>
                    </label>
                    <span className="acd-hint">{t('column.titleHint')}</span>
                </div>
            </div>
        </div>
    )
}
