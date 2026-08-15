import { useEffect, useRef, useState } from 'react'
import { BsCheckSquare, BsSquare } from 'react-icons/bs'
import { FiExternalLink } from 'react-icons/fi'
import { t } from '../../i18n'

/**
 * Column types without a modal of their own. They all get `field` and write
 * their value there — that is what makes several columns of the same type
 * possible.
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
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
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
        <section className='picker longtext-picker'
            onClick={() => { setIsOpen(true); setIsEditing(true) }}>
            <span className={`longtext-value${value ? '' : ' is-empty'}`}>
                {value || '—'}
            </span>
            {isOpen && (
                <div ref={elBox} className='longtext-box' onClick={e => e.stopPropagation()}>
                    <textarea autoFocus rows={4} value={draft} onChange={e => setDraft(e.target.value)}
                        onBlur={commit} />
                </div>
            )}
        </section>
    )
}

export function CheckboxPicker ({ info, field, onUpdate }) {
    const checked = Boolean(info[field])
    return (
        <section className='picker checkbox-picker'
            onClick={() => onUpdate(field, !checked)}
            title={checked ? t('common.done') : t('common.open2')}>
            {checked
                ? <BsCheckSquare className='checkbox-on' />
                : <BsSquare className='checkbox-off' />}
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
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
            </section>
        )
    }

    return (
        <section className='picker link-picker is-view' onClick={() => setIsEditing(true)}>
            {value
                ? <>
                    <a href={value} target='_blank' rel='noreferrer' onClick={e => e.stopPropagation()}
                        >
                        {value.replace(/^https?:\/\//, '')}
                    </a>
                    <FiExternalLink className='link-icon' />
                </>
                : <span className='link-empty'>—</span>}
        </section>
    )
}

/**
 * Free choice with suggestions. The suggestion list is built from the values
 * that already occur in this column on the board — that way the column needs
 * no settings dialog of its own.
 */
export function DropdownPicker ({ info, field, onUpdate, board }) {
    const value = info[field] ?? ''
    const [draft, setDraft] = useState(value)
    const [isEditing, setIsEditing] = useState(false)
    useEffect(() => { if (!isEditing) setDraft(value) }, [value, isEditing])

    const listId = `dd-${field}`
    const options = [...new Set(
        (board?.groups || []).flatMap(g => (g.tasks || []).map(task => task[field])).filter(v => typeof v === 'string' && v)
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
                />
            <datalist id={listId}>
                {options.map(o => <option key={o} value={o} />)}
            </datalist>
        </section>
    )
}
