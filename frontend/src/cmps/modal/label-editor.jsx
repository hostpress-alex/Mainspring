import { useMemo, useState } from 'react'
import { FiTrash } from 'react-icons/fi'
import { AiOutlinePlus } from 'react-icons/ai'
import './label-editor.css'

/**
 * Labels einer Status- oder Prioritaets-Spalte bearbeiten.
 *
 * Wichtig zu wissen: Tasks speichern den TITEL des Labels, nicht seine Id.
 * Umbenennen und Loeschen muessen deshalb auf die betroffenen Tasks
 * durchschlagen — was hier vorbereitet und vom Aufrufer gespeichert wird.
 * Deshalb merkt sich jede Zeile ihren urspruenglichen Titel (`was`).
 *
 * Der Editor bringt seine eigenen Grundregeln mit und haengt bewusst NICHT
 * im Markup der Label-Auswahl: deren CSS gibt jedem li eine feste Hoehe von
 * 32px und weisse Schrift — beides macht ein Eingabeformular unbenutzbar.
 */

const PALETTE = [
    '#00c875', '#9cd326', '#cab641', '#ffcb00', '#fdab3d', '#ff642e',
    '#e2445c', '#ff158a', '#ff5ac4', '#a25ddc', '#0086c0', '#579bfc',
    '#66ccff', '#bb3354', '#7f5347', '#c4c4c4', '#808080', '#333333',
]

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
function makeLabelId () {
    let id = 'lb_'
    for (let i = 0; i < 8; i++) id += CHARS[Math.floor(Math.random() * CHARS.length)]
    return id
}

export function LabelEditor ({ column, board, onSave, onCancel, isSaving = false, err = null }) {
    const source = Array.isArray(column?.labels) ? column.labels : (board?.labels || [])

    // Das leere Label ist kein normaler Eintrag: es ist der Weg, einen Wert
    // wieder zurueckzunehmen. Es wird nicht bearbeitet und nicht geloescht.
    const emptyLabel = useMemo(
        () => source.find(l => !l.title) || { id: makeLabelId(), title: '', color: '#c4c4c4' },
        [column?.id])

    const [rows, setRows] = useState(() => source
        .filter(l => l && l.title)
        .map(l => ({ id: l.id || makeLabelId(), title: l.title, color: l.color || '#c4c4c4', was: l.title })))
    const [openPalette, setOpenPalette] = useState(null)
    const [localErr, setLocalErr] = useState(null)

    const field = column?.field || column?.id
    const message = err || localErr

    /** Wie viele Tasks haengen an diesem Titel? */
    function countUsage (title) {
        if (!title || !field) return 0
        let n = 0
        for (const group of board?.groups || []) {
            for (const task of group.tasks || []) {
                if (task && task[field] === title) n++
            }
        }
        return n
    }

    function setRow (id, patch) {
        setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
        setLocalErr(null)
    }

    function onAdd () {
        const id = makeLabelId()
        setRows(prev => [...prev, {
            id, title: '', color: PALETTE[prev.length % PALETTE.length], was: null,
        }])
        setLocalErr(null)
    }

    function onRemove (id) {
        setRows(prev => prev.filter(r => r.id !== id))
        if (openPalette === id) setOpenPalette(null)
        setLocalErr(null)
    }

    function onSubmit (ev) {
        ev.preventDefault()
        if (isSaving) return
        const cleaned = rows.map(r => ({ ...r, title: r.title.trim() }))

        if (cleaned.some(r => !r.title)) {
            setLocalErr('Jedes Label braucht einen Namen.')
            return
        }
        const titles = cleaned.map(r => r.title.toLowerCase())
        if (new Set(titles).size !== titles.length) {
            setLocalErr('Zwei Labels mit demselben Namen gehen nicht — Tasks werden über den Namen zugeordnet.')
            return
        }

        // Was hat sich gegenueber dem gespeicherten Stand geaendert?
        const renames = {}
        for (const r of cleaned) {
            if (r.was && r.was !== r.title) renames[r.was] = r.title
        }
        const kept = new Set(cleaned.map(r => r.was).filter(Boolean))
        const removed = source.filter(l => l && l.title && !kept.has(l.title)).map(l => l.title)

        const labels = [
            ...cleaned.map(r => ({ id: r.id, title: r.title, color: r.color })),
            emptyLabel,
        ]
        onSave({ labels, renames, removed })
    }

    return (
        <form className="label-editor" onSubmit={onSubmit} onMouseDown={ev => ev.stopPropagation()}>
            <div className="label-editor-head">
                <span className="label-editor-title">Labels bearbeiten</span>
                {column?.title && <span className="label-editor-col">{column.title}</span>}
            </div>

            <div className="label-editor-scroll">
                <ul className="label-editor-list">
                    {rows.map(row => {
                        const used = row.was ? countUsage(row.was) : 0
                        return (
                            <li key={row.id} className="label-editor-row">
                                <div className="label-editor-line">
                                    <button type="button" className="label-editor-swatch"
                                        style={{ backgroundColor: row.color }}
                                        title="Farbe ändern"
                                        onClick={() => setOpenPalette(openPalette === row.id ? null : row.id)} />
                                    <input className="label-editor-input" value={row.title} placeholder="Name"
                                        onChange={ev => setRow(row.id, { title: ev.target.value })} />
                                    {used > 0 && (
                                        <span className="label-editor-usage" title={`${used} Task(s) benutzen dieses Label`}>
                                            {used}
                                        </span>
                                    )}
                                    <button type="button" className="label-editor-remove"
                                        title={used
                                            ? `Entfernen — ${used} Task(s) werden dabei geleert`
                                            : 'Label entfernen'}
                                        onClick={() => onRemove(row.id)}>
                                        <FiTrash />
                                    </button>
                                </div>
                                {/* Die Palette steht bewusst IM Fluss unter der Zeile.
                                    Absolut positioniert wurde sie vom scrollenden
                                    Bereich abgeschnitten. */}
                                {openPalette === row.id && (
                                    <div className="label-editor-palette">
                                        {PALETTE.map(color => (
                                            <button key={color} type="button"
                                                className={color === row.color ? 'is-active' : ''}
                                                style={{ backgroundColor: color }}
                                                title={color}
                                                onClick={() => { setRow(row.id, { color }); setOpenPalette(null) }} />
                                        ))}
                                    </div>
                                )}
                            </li>
                        )
                    })}
                </ul>

                {!rows.length && <p className="label-editor-empty">Noch keine Labels.</p>}
            </div>

            <button type="button" className="label-editor-add" onClick={onAdd}>
                <AiOutlinePlus /> Label hinzufügen
            </button>

            {message && <p className="label-editor-err">{message}</p>}

            <p className="label-editor-hint">
                Umbenennen zieht auf alle Tasks mit diesem Label durch.
                Entfernen leert die Spalte bei den betroffenen Tasks.
            </p>

            <div className="label-editor-actions">
                <button type="submit" className="label-editor-save" disabled={isSaving}>
                    {isSaving ? 'Speichert…' : 'Speichern'}
                </button>
                <button type="button" className="label-editor-cancel" onClick={onCancel} disabled={isSaving}>
                    Abbrechen
                </button>
            </div>
        </form>
    )
}
