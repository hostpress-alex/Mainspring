import { useEffect, useRef, useState } from 'react'
import { BsCheckSquare, BsSquare } from 'react-icons/bs'
import { FiExternalLink } from 'react-icons/fi'

/**
 * Spaltentypen ohne eigenes Modal. Alle bekommen `field` und schreiben ihren
 * Wert dorthin — dadurch sind mehrere Spalten desselben Typs moeglich.
 */

function useDraft (value) {
    const [draft, setDraft] = useState(value ?? '')
    const [isEditing, setIsEditing] = useState(false)
    useEffect(() => { if (!isEditing) setDraft(value ?? '') }, [value, isEditing])
    return { draft, setDraft, isEditing, setIsEditing }
}

export function TextPicker ({ info, field, onUpdate }) {
    const value = info[field] ?? ''
    const { draft, setDraft, setIsEditing } = useDraft(value)

    function commit () {
        setIsEditing(false)
        if (draft !== value) onUpdate(field, draft)
    }

    return (
        <section className='picker text-picker'>
            <input type='text' value={draft} placeholder='—'
                onFocus={() => setIsEditing(true)}
                onChange={e => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                style={{ width: '100%', border: 'none', background: 'transparent',
                    textAlign: 'center', font: 'inherit', color: 'inherit', outline: 'none' }} />
        </section>
    )
}

export function LongTextPicker ({ info, field, onUpdate }) {
    const value = info[field] ?? ''
    const [isOpen, setIsOpen] = useState(false)
    const { draft, setDraft, setIsEditing } = useDraft(value)
    const elBox = useRef()

    function commit () {
        setIsEditing(false)
        setIsOpen(false)
        if (draft !== value) onUpdate(field, draft)
    }

    return (
        <section className='picker longtext-picker' style={{ position: 'relative' }}
            onClick={() => { setIsOpen(true); setIsEditing(true) }}>
            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap', padding: '0 8px', opacity: value ? 1 : .45 }}>
                {value || '—'}
            </span>
            {isOpen && (
                <div ref={elBox} style={{ position: 'absolute', zIndex: 40, top: '100%', left: 0, width: 280,
                    background: '#fff', border: '1px solid #c3c6d4', borderRadius: 6, padding: 8,
                    boxShadow: '0 6px 20px rgba(0,0,0,.18)' }} onClick={e => e.stopPropagation()}>
                    <textarea autoFocus rows={4} value={draft} onChange={e => setDraft(e.target.value)}
                        onBlur={commit}
                        style={{ width: '100%', border: '1px solid #e0e3ee', borderRadius: 4, padding: 6,
                            font: 'inherit', resize: 'vertical' }} />
                </div>
            )}
        </section>
    )
}

export function CheckboxPicker ({ info, field, onUpdate }) {
    const checked = Boolean(info[field])
    return (
        <section className='picker checkbox-picker' style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => onUpdate(field, !checked)}
            title={checked ? 'Erledigt' : 'Offen'}>
            {checked
                ? <BsCheckSquare style={{ color: '#00c875', fontSize: 18 }} />
                : <BsSquare style={{ color: '#c3c6d4', fontSize: 18 }} />}
        </section>
    )
}

export function LinkPicker ({ info, field, onUpdate }) {
    const value = info[field] ?? ''
    const [isEditing, setIsEditing] = useState(false)
    const [draft, setDraft] = useState(value)
    useEffect(() => { if (!isEditing) setDraft(value) }, [value, isEditing])

    function commit () {
        setIsEditing(false)
        const clean = draft.trim()
        if (clean !== value) onUpdate(field, clean)
    }

    if (isEditing) {
        return (
            <section className='picker link-picker'>
                <input autoFocus type='url' value={draft} placeholder='https://…'
                    onChange={e => setDraft(e.target.value)} onBlur={commit}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'center',
                        font: 'inherit', color: 'inherit', outline: 'none' }} />
            </section>
        )
    }

    return (
        <section className='picker link-picker' onClick={() => setIsEditing(true)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            {value
                ? <>
                    <a href={value} target='_blank' rel='noreferrer' onClick={e => e.stopPropagation()}
                        style={{ color: '#0073ea', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                        {value.replace(/^https?:\/\//, '')}
                    </a>
                    <FiExternalLink style={{ color: '#0073ea', flexShrink: 0 }} />
                </>
                : <span style={{ opacity: .45 }}>—</span>}
        </section>
    )
}

/**
 * Freie Auswahl mit Vorschlaegen. Die Vorschlagsliste entsteht aus den Werten,
 * die in dieser Spalte im Board bereits vorkommen — dadurch braucht die Spalte
 * keinen eigenen Einstellungsdialog.
 */
export function DropdownPicker ({ info, field, onUpdate, board }) {
    const value = info[field] ?? ''
    const [draft, setDraft] = useState(value)
    const [isEditing, setIsEditing] = useState(false)
    useEffect(() => { if (!isEditing) setDraft(value) }, [value, isEditing])

    const listId = `dd-${field}`
    const options = [...new Set(
        (board?.groups || []).flatMap(g => (g.tasks || []).map(t => t[field])).filter(v => typeof v === 'string' && v)
    )]

    function commit () {
        setIsEditing(false)
        const clean = String(draft).trim()
        if (clean !== value) onUpdate(field, clean)
    }

    return (
        <section className='picker dropdown-picker'>
            <input list={listId} value={draft} placeholder='—'
                onFocus={() => setIsEditing(true)}
                onChange={e => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'center',
                    font: 'inherit', color: 'inherit', outline: 'none' }} />
            <datalist id={listId}>
                {options.map(o => <option key={o} value={o} />)}
            </datalist>
        </section>
    )
}
