import {useEffect, useState} from 'react'

import {listWithUsage, createPriority, updatePriority, removePriority, reorderPriorities} from '../../services/priority.store'
import {Icon} from '../icon'
import {t} from '../../i18n'

const NEW_COLOR = '#0073ea'

/**
 * The global priority list, as an admin sees it.
 *
 * Three things this screen is careful about, all of them consequences of the
 * list being global:
 *
 *   - A rename is harmless. Tasks store the id, so the word can be corrected
 *     at any time and nothing else moves. That is why the name is an ordinary
 *     field that saves when it loses focus, with no confirmation.
 *   - A deletion is not. It is the only operation here that changes what a
 *     task says, so it asks where those tasks should go and names the number
 *     before it does anything.
 *   - The order is data. "Low, Medium, High" is the order that means
 *     something, and it is not alphabetical — so it is moved by hand and
 *     stored.
 */
export function PriorityAdmin({onError}){
    const [rows, setRows] = useState([])
    const [draft, setDraft] = useState({title: '', color: NEW_COLOR})
    const [deleting, setDeleting] = useState(null)
    const [moveTo, setMoveTo] = useState('')
    const [isBusy, setIsBusy] = useState(false)

    useEffect(() => {
        reload()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    async function reload(){
        try {
            setRows(await listWithUsage())
        } catch(err) {
            onError(err)
        }
    }

    /** Every write goes through here, so none of them can be run twice. */
    async function run(fn){
        if(isBusy) return
        setIsBusy(true)
        try {
            await fn()
            await reload()
        } catch(err) {
            onError(err)
        } finally {
            setIsBusy(false)
        }
    }

    function onAdd(ev){
        ev.preventDefault()
        if(!draft.title.trim()) return
        run(async () => {
            await createPriority(draft)
            setDraft({title: '', color: NEW_COLOR})
        })
    }

    /** Saved on blur, and only when it actually changed. */
    function onRename(row, title){
        if(title.trim() === row.title) return
        run(() => updatePriority(row.id, {title}))
    }

    function onRecolor(row, color){
        if(color === row.color) return
        run(() => updatePriority(row.id, {color}))
    }

    function onMove(index, delta){
        const next = [...rows]
        const to = index + delta
        if(to < 0 || to >= next.length) return
        const [row] = next.splice(index, 1)
        next.splice(to, 0, row)
        // Shown before it is saved: waiting for the round trip makes the
        // arrows feel broken.
        setRows(next)
        run(() => reorderPriorities(next.map(r => r.id)))
    }

    function onAskDelete(row){
        setDeleting(row)
        // Anything but the one being deleted, so the field is never empty
        // when it is needed.
        const other = rows.find(r => r.id !== row.id)
        setMoveTo(other?other.id:'')
    }

    function onConfirmDelete(){
        const row = deleting
        run(async () => {
            await removePriority(row.id, row.usage > 0?moveTo:null)
            setDeleting(null)
        })
    }

    const isLast = rows.length <= 1

    return (
        <div className="admin-card">
            <h2 className="admin-section-title">{t('priority.sectionTitle')}</h2>
            <p className="admin-sub">{t('priority.sectionHelp')}</p>
            {/* Said here rather than left to be remembered: the arrows below
                are not decoration, they are the planning order. */}
            <p className="admin-sub is-footnote">{t('priority.orderHint')}</p>

            <table className="admin-table priority-table">
                <thead>
                    <tr>
                        <th className="admin-th"></th>
                        <th className="admin-th">{t('priority.name')}</th>
                        <th className="admin-th">{t('common.usage')}</th>
                        <th className="admin-th"></th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={row.id}>
                            <td className="admin-td priority-color-cell">
                                <input type="color" className="priority-color" value={row.color}
                                    title={t('priority.color')}
                                    onChange={ev => onRecolor(row, ev.target.value)}/>
                            </td>
                            <td className="admin-td">
                                <input className="admin-input priority-name" defaultValue={row.title}
                                    key={row.id + row.title}
                                    onBlur={ev => onRename(row, ev.target.value)}
                                    onKeyDown={ev => {
                                        if(ev.key === 'Enter') ev.currentTarget.blur()
                                        if(ev.key === 'Escape'){
                                            ev.currentTarget.value = row.title
                                            ev.currentTarget.blur()
                                        }
                                    }}/>
                            </td>
                            <td className="admin-td priority-usage">
                                {row.usage?t('priority.inUse', {n: row.usage}):t('priority.unused')}
                            </td>
                            <td className="admin-td priority-tools">
                                <button type="button" className="admin-btn-ghost" disabled={i === 0 || isBusy}
                                    title={t('common.moveUp')} onClick={() => onMove(i, -1)}>
                                    <Icon name="arrow-up"/>
                                </button>
                                <button type="button" className="admin-btn-ghost" disabled={i === rows.length - 1 || isBusy}
                                    title={t('common.moveDown')} onClick={() => onMove(i, 1)}>
                                    <Icon name="arrow-down"/>
                                </button>
                                <button type="button" className="admin-btn-danger" disabled={isLast || isBusy}
                                    title={isLast?t('priority.lastOne'):t('common.delete')}
                                    onClick={() => onAskDelete(row)}>
                                    <Icon name="trash"/>
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {deleting && (
                <div className="priority-delete">
                    <h3>{t('priority.deleteTitle', {title: deleting.title})}</h3>
                    {deleting.usage > 0?(
                        <>
                            <p>{t('priority.deleteUsed', {n: deleting.usage})}</p>
                            <label className="priority-move">
                                <span>{t('priority.moveTo')}</span>
                                <select className="admin-input" value={moveTo} onChange={ev => setMoveTo(ev.target.value)}>
                                    {rows.filter(r => r.id !== deleting.id).map(r =>
                                        <option key={r.id} value={r.id}>{r.title}</option>)}
                                </select>
                            </label>
                        </>
                    ):(
                        <p>{t('priority.unused')}</p>
                    )}
                    <div className="priority-delete-tools">
                        <button type="button" className="admin-btn-ghost" onClick={() => setDeleting(null)}>
                            {t('common.cancel')}
                        </button>
                        <button type="button" className="admin-btn-danger"
                            disabled={isBusy || (deleting.usage > 0 && !moveTo)}
                            onClick={onConfirmDelete}>
                            {t('common.delete')}
                        </button>
                    </div>
                </div>
            )}

            <form className="priority-add" onSubmit={onAdd}>
                <input type="color" className="priority-color" value={draft.color}
                    title={t('priority.color')}
                    onChange={ev => setDraft({...draft, color: ev.target.value})}/>
                <input className="admin-input" placeholder={t('priority.name')} value={draft.title}
                    onChange={ev => setDraft({...draft, title: ev.target.value})}/>
                <button className="admin-btn" type="submit" disabled={isBusy || !draft.title.trim()}>
                    {t('priority.add')}
                </button>
            </form>
        </div>
    )
}
