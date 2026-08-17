import {useEffect, useRef, useState} from 'react'
import { Icon } from '../icon'
import {t} from '../../i18n'

/**
 * Column types without a modal of their own. They all get `field` and write
 * their value there — that is what makes several columns of the same type
 * possible.
 */

function useDraft(value){
    const [draft, setDraft] = useState(value ?? '')
    const [isEditing, setIsEditing] = useState(false)
    useEffect(() => {
        if(!isEditing) setDraft(value ?? '')
    }, [value, isEditing])
    return {draft, setDraft, isEditing, setIsEditing}
}

export function TextPicker({info, field, onUpdate, readOnly = false}){
    const value = info[field] ?? ''
    const {draft, setDraft, setIsEditing} = useDraft(value)

    function commit(){
        setIsEditing(false)
        if(draft !== value) onUpdate(field, draft)
    }

    return (
        <section className="picker text-picker">
            {/* readOnly rather than disabled: the text stays selectable and
                copyable, which is most of what a viewer is here for. */}
            <input type="text" readOnly={readOnly} value={draft} placeholder="—" onFocus={() => !readOnly && setIsEditing(true)} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => {
                if(e.key === 'Enter') e.currentTarget.blur()
            }}/>
        </section>
    )
}

export function LongTextPicker({info, field, onUpdate, readOnly = false}){
    const value = info[field] ?? ''
    const [isOpen, setIsOpen] = useState(false)
    const {draft, setDraft, setIsEditing} = useDraft(value)
    const elBox = useRef()

    function commit(){
        setIsEditing(false)
        setIsOpen(false)
        if(draft !== value) onUpdate(field, draft)
    }

    return (
        <section className={`picker longtext-picker${readOnly?' is-readonly':''}`} onClick={readOnly?undefined:() => {
            setIsOpen(true);
            setIsEditing(true)
        }}>
            <span className={`longtext-value${value?'':' is-empty'}`}>
                {value || '—'}
            </span>
            {isOpen && (
                <div ref={elBox} className="longtext-box" onClick={e => e.stopPropagation()}>
                    <textarea autoFocus rows={4} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}/>
                </div>
            )}
        </section>
    )
}

export function CheckboxPicker({info, field, onUpdate, readOnly = false}){
    const checked = Boolean(info[field])
    return (
        <section className={`picker checkbox-picker${readOnly?' is-readonly':''}`}
            onClick={readOnly?undefined:() => onUpdate(field, !checked)}
            title={checked?t('common.done'):t('common.open2')}>
            {checked
                ?<Icon name='square-check' variant='fa-regular' className="checkbox-on"/>
                :<Icon name='square' variant='fa-regular' className="checkbox-off"/>}
        </section>
    )
}

export function LinkPicker({info, field, onUpdate, readOnly = false}){
    const value = info[field] ?? ''
    const [isEditing, setIsEditing] = useState(false)
    const [draft, setDraft] = useState(value)
    useEffect(() => {
        if(!isEditing) setDraft(value)
    }, [value, isEditing])

    function commit(){
        setIsEditing(false)
        const clean = draft.trim()
        if(clean !== value) onUpdate(field, clean)
    }

    if(isEditing && !readOnly){
        return (
            <section className="picker link-picker">
                <input autoFocus type="url" value={draft} placeholder="https://…" onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => {
                    if(e.key === 'Enter') e.currentTarget.blur()
                }}/>
            </section>
        )
    }

    // The link itself still works — following it is reading. Only the step
    // into the edit field goes.
    return (
        <section className={`picker link-picker is-view${readOnly?' is-readonly':''}`}
            onClick={readOnly?undefined:() => setIsEditing(true)}>
            {value
                ?<>
                    <a href={value} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                        {value.replace(/^https?:\/\//, '')}
                    </a>
                    <Icon name='arrow-up-right-from-square' className="link-icon"/>
                </>
                :<span className="link-empty">—</span>}
        </section>
    )
}

/**
 * Free choice with suggestions. The suggestion list is built from the values
 * that already occur in this column on the board — that way the column needs
 * no settings dialog of its own.
 */
export function DropdownPicker({info, field, onUpdate, board, readOnly = false}){
    const value = info[field] ?? ''
    const [draft, setDraft] = useState(value)
    const [isEditing, setIsEditing] = useState(false)
    useEffect(() => {
        if(!isEditing) setDraft(value)
    }, [value, isEditing])

    const listId = `dd-${field}`
    const options = [...new Set(
        (board?.groups || []).flatMap(g => (g.tasks || []).map(task => task[field])).filter(v => typeof v === 'string' && v)
    )]

    function commit(){
        setIsEditing(false)
        const clean = String(draft).trim()
        if(clean !== value) onUpdate(field, clean)
    }

    return (
        <section className="picker dropdown-picker">
            <input list={readOnly?undefined:listId} readOnly={readOnly} value={draft} placeholder="—" onFocus={() => !readOnly && setIsEditing(true)} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => {
                if(e.key === 'Enter') e.currentTarget.blur()
            }}/>
            <datalist id={listId}>
                {options.map(o => <option key={o} value={o}/>)}
            </datalist>
        </section>
    )
}
