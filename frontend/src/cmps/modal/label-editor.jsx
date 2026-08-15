import {useMemo, useState} from 'react'
import {FiTrash} from 'react-icons/fi'
import {AiOutlinePlus} from 'react-icons/ai'
import './label-editor.css'
import {t} from '../../i18n'

/**
 * Edit the labels of a status or priority column.
 *
 * Worth knowing: tasks store the TITLE of the label, not its id. Renaming and
 * deleting therefore have to reach the affected tasks — which is prepared
 * here and saved by the caller. That is why every row remembers its original
 * title (`was`).
 *
 * The editor brings its own base rules and deliberately does NOT hang in the
 * markup of the label picker: its CSS gives every li a fixed height of 32px
 * and white text — both make an input form unusable.
 */

const PALETTE = [
    '#00c875', '#9cd326', '#cab641', '#ffcb00', '#fdab3d', '#ff642e',
    '#e2445c', '#ff158a', '#ff5ac4', '#a25ddc', '#0086c0', '#579bfc',
    '#66ccff', '#bb3354', '#7f5347', '#c4c4c4', '#808080', '#333333'
]

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

function makeLabelId(){
    let id = 'lb_'
    for(let i = 0; i < 8; i++) id += CHARS[Math.floor(Math.random() * CHARS.length)]
    return id
}

export function LabelEditor({column, board, onSave, onCancel, isSaving = false, err = null}){
    const source = Array.isArray(column?.labels)?column.labels:(board?.labels || [])

    // The empty label is not a normal entry: it is the way to take a value
    // back again. It is not edited and not deleted.
    const emptyLabel = useMemo(
        () => source.find(l => !l.title) || {id: makeLabelId(), title: '', color: '#c4c4c4'},
        [column?.id])

    const [rows, setRows] = useState(() => source.filter(l => l && l.title).map(l => ({
        id: l.id || makeLabelId(),
        title: l.title,
        color: l.color || '#c4c4c4',
        original: l.title
    })))
    const [openPalette, setOpenPalette] = useState(null)
    const [localErr, setLocalErr] = useState(null)

    const field = column?.field || column?.id
    const message = err || localErr

    /** Wie viele Tasks haengen an diesem Titel? */
    function countUsage(title){
        if(!title || !field) return 0
        let n = 0
        for(const group of board?.groups || []){
            for(const task of group.tasks || []){
                if(task && task[field] === title) n++
            }
        }
        return n
    }

    function setRow(id, patch){
        setRows(prev => prev.map(r => r.id === id?{...r, ...patch}:r))
        setLocalErr(null)
    }

    function onAdd(){
        const id = makeLabelId()
        setRows(prev => [...prev, {
            id, title: '', color: PALETTE[prev.length % PALETTE.length], original: null
        }])
        setLocalErr(null)
    }

    function onRemove(id){
        setRows(prev => prev.filter(r => r.id !== id))
        if(openPalette === id) setOpenPalette(null)
        setLocalErr(null)
    }

    function onSubmit(ev){
        ev.preventDefault()
        if(isSaving) return
        const cleaned = rows.map(r => ({...r, title: r.title.trim()}))

        if(cleaned.some(r => !r.title)){
            setLocalErr(t('label.nameRequired'))
            return
        }
        const titles = cleaned.map(r => r.title.toLowerCase())
        if(new Set(titles).size !== titles.length){
            setLocalErr('Zwei Labels mit demselben Namen gehen nicht — Tasks werden über den Namen zugeordnet.')
            return
        }

        // What has changed against the saved state?
        const renames = {}
        for(const r of cleaned){
            if(r.original && r.original !== r.title) renames[r.original] = r.title
        }
        const kept = new Set(cleaned.map(r => r.original).filter(Boolean))
        const removed = source.filter(l => l && l.title && !kept.has(l.title)).map(l => l.title)

        const labels = [
            ...cleaned.map(r => ({id: r.id, title: r.title, color: r.color})),
            emptyLabel
        ]
        onSave({labels, renames, removed})
    }

    return (
        <form className="label-editor" onSubmit={onSubmit} onMouseDown={ev => ev.stopPropagation()}>
            <div className="label-editor-head">
                <span className="label-editor-title">{t('label.edit')}</span>
                {column?.title && <span className="label-editor-col">{column.title}</span>}
            </div>

            <div className="label-editor-scroll">
                <ul className="label-editor-list">
                    {rows.map(row => {
                        const used = row.original?countUsage(row.original):0
                        return (
                            <li key={row.id} className="label-editor-row">
                                <div className="label-editor-line">
                                    <button type="button" className="label-editor-swatch" style={{'--label-color': row.color}} title={t('label.changeColor')} onClick={() => setOpenPalette(openPalette === row.id?null:row.id)}/>
                                    <input className="label-editor-input" value={row.title} placeholder={t('common.name')} onChange={ev => setRow(row.id, {title: ev.target.value})}/>
                                    {used > 0 && (
                                        <span className="label-editor-usage" title={t('label.usedBy', {n: used})}>
                                            {used}
                                        </span>
                                    )}
                                    <button type="button" className="label-editor-remove" title={used
                                        ?t('label.removeUsed', {n: used})
                                        :t('label.remove')} onClick={() => onRemove(row.id)}>
                                        <FiTrash/>
                                    </button>
                                </div>
                                {/* The palette deliberately sits IN the flow below the row.
                                    Absolutely positioned it got cut off by the
                                    scrolling area. */}
                                {openPalette === row.id && (
                                    <div className="label-editor-palette">
                                        {PALETTE.map(color => (
                                            <button key={color} type="button" className={color === row.color?'is-active':''} style={{'--label-color': color}} title={color} onClick={() => {
                                                setRow(row.id, {color});
                                                setOpenPalette(null)
                                            }}/>
                                        ))}
                                    </div>
                                )}
                            </li>
                        )
                    })}
                </ul>

                {!rows.length && <p className="label-editor-empty">{t('label.none')}</p>}
            </div>

            <button type="button" className="label-editor-add" onClick={onAdd}>
                <AiOutlinePlus/> Label hinzufügen
            </button>

            {message && <p className="label-editor-err">{message}</p>}

            <p className="label-editor-hint">
                Umbenennen zieht auf alle Tasks mit diesem Label durch.
                Entfernen leert die Spalte bei den betroffenen Tasks. </p>

            <div className="label-editor-actions">
                <button type="submit" className="label-editor-save" disabled={isSaving}>
                    {isSaving?t('common.saving'):t('common.save')}
                </button>
                <button type="button" className="label-editor-cancel" onClick={onCancel} disabled={isSaving}>
                    {t('common.cancel')}
                </button>
            </div>
        </form>
    )
}
