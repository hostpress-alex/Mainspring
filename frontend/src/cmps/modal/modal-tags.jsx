import {useMemo, useState} from 'react'
import {useSelector} from 'react-redux'

import {setDynamicModalObj, closeDynamicModal, saveColumnTags} from '../../store/board.actions'
import {
    tagsOf, findTagByTitle, valueOf, withTag, withoutTag, usageOf,
    cleanTagTitle, addTag, renameTag, recolorTag, TAG_PALETTE, MAX_TAGS_PER_TASK
} from '../../services/tags'
import {Icon} from '../icon'
import {t} from '../../i18n'

/**
 * Picking tags, and keeping the list in order.
 *
 * Two screens in one popup, because they are two different jobs done by the
 * same people minutes apart: putting a tag on a task, and repairing the list
 * afterwards. The second one is behind a link rather than in front, since it
 * is needed once a month.
 *
 * The search field does the work that keeps the list usable: it filters
 * first, and only offers "create" when nothing matches. Somebody typing
 * "website" while "Website" exists gets the existing one — see addTag.
 */
export function ModalTags({dynamicModalObj}){
    const board = useSelector(storeState => storeState.boardModule.board)
    const [isManaging, setIsManaging] = useState(false)
    const [query, setQuery] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [err, setErr] = useState(null)

    const column = dynamicModalObj.column
    const field = dynamicModalObj.field
    const task = dynamicModalObj.task

    const tags = tagsOf(column)
    const value = valueOf(task, field)
    const usage = useMemo(() => usageOf(board, field), [board, field])

    const clean = cleanTagTitle(query)
    const filtered = clean
        ? tags.filter(tag => tag.title.toLowerCase().includes(clean.toLowerCase()))
        : tags
    const exact = clean?findTagByTitle(tags, clean):null

    function onToggle(id){
        const next = value.includes(id)?withoutTag(value, id):withTag(value, id)
        dynamicModalObj.onTaskUpdate(field, next)
        // The popup stays open: putting three tags on a task is one job, not
        // three, and reopening the list twice for it is what makes people
        // give up on tagging.
        setDynamicModalObj({...dynamicModalObj, task: {...task, [field]: next}})
    }

    async function onCreate(){
        if(!clean || isSaving) return
        setErr(null)
        setIsSaving(true)
        try {
            const {tags: nextTags, tag} = addTag(tags, clean)
            // The list first, then the task: the value points at an id, and
            // an id that is not in the column yet would be a chip nobody can
            // draw if the second write failed.
            await saveColumnTags(board, column, nextTags)
            dynamicModalObj.onTaskUpdate(field, withTag(value, tag.id))
            setQuery('')
            closeDynamicModal()
        } catch(e) {
            setErr(readErr(e))
        } finally {
            setIsSaving(false)
        }
    }

    if(isManaging){
        return <ManageTags board={board} column={column} onBack={() => setIsManaging(false)}/>
    }

    return (
        <section className="modal-tags">
            <header className="modal-tags-head">
                <span>{t('tags.addTitle')}</span>
            </header>

            <input className="modal-tags-search" autoFocus value={query}
                placeholder={t('tags.search')}
                onChange={ev => setQuery(ev.target.value)}
                onKeyDown={ev => {
                    if(ev.key === 'Enter'){
                        ev.preventDefault()
                        if(exact) onToggle(exact.id)
                        else onCreate()
                    }
                }}/>

            {err && <p className="modal-tags-err">{err}</p>}

            <ul className="modal-tags-list">
                {filtered.map(tag => {
                    const isOn = value.includes(tag.id)
                    return (
                        <li key={tag.id} className={`modal-tags-item${isOn?' is-on':''}`}
                            style={{'--tag-color': tag.color}}
                            onClick={() => onToggle(tag.id)}>
                            <span className="modal-tags-name">#{tag.title}</span>
                            {/* How often it is used on this board. The number is
                                what tells a living tag from one somebody tried
                                once and forgot. */}
                            <span className="modal-tags-count">{usage[tag.id] || 0}</span>
                        </li>
                    )
                })}
                {filtered.length === 0 && !clean && (
                    <li className="modal-tags-none">{t('tags.none')}</li>
                )}
            </ul>

            <button type="button" className="modal-tags-create" disabled={!clean || Boolean(exact) || isSaving}
                onClick={onCreate}>
                {clean && !exact?t('tags.createNamed', {name: clean}):t('tags.create')}
            </button>

            {value.length >= MAX_TAGS_PER_TASK && (
                <p className="modal-tags-err">{t('tags.tooMany', {n: MAX_TAGS_PER_TASK})}</p>
            )}

            <button type="button" className="modal-tags-manage" onClick={() => setIsManaging(true)}>
                {t('tags.manage')}
            </button>
        </section>
    )
}

/**
 * Repairing the list: rename, recolour, merge, delete.
 *
 * Merge is the one that matters. A tag list without it collects "Website",
 * "website" and "Web-Site" and there is no way back — every count is then
 * wrong and everybody stops trusting the column. Deleting without a
 * replacement is offered next to it, for the tags that were simply a mistake.
 */
function ManageTags({board, column, onBack}){
    const field = column.field || column.id
    const tags = tagsOf(column)
    const usage = useMemo(() => usageOf(board, field), [board, field])
    const [pending, setPending] = useState(null)     // {tag, mode: 'merge'|'delete'}
    const [mergeInto, setMergeInto] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [err, setErr] = useState(null)

    async function run(fn){
        setErr(null)
        setIsSaving(true)
        try {
            await fn()
            setPending(null)
        } catch(e) {
            setErr(readErr(e))
        } finally {
            setIsSaving(false)
        }
    }

    function onRename(tag, title){
        const next = renameTag(tags, tag.id, title)
        if(next === null) return setErr(t('tags.nameTaken'))
        if(cleanTagTitle(title) === tag.title) return
        run(() => saveColumnTags(board, column, next))
    }

    function onColor(tag, color){
        run(() => saveColumnTags(board, column, recolorTag(tags, tag.id, color)))
    }

    function onConfirm(){
        const tag = pending.tag
        if(pending.mode === 'merge'){
            if(!mergeInto) return
            return run(() => saveColumnTags(board, column, tags.filter(x => x.id !== tag.id),
                {mergeFrom: tag.id, mergeInto}))
        }
        run(() => saveColumnTags(board, column, tags.filter(x => x.id !== tag.id), {removed: [tag.id]}))
    }

    return (
        <section className="modal-tags is-managing">
            <header className="modal-tags-head">
                <button type="button" className="modal-tags-back" onClick={onBack}>
                    <Icon name="chevron-left"/>
                </button>
                <span>{t('tags.manageTitle')}</span>
            </header>

            {err && <p className="modal-tags-err">{err}</p>}

            <ul className="modal-tags-manage-list">
                {tags.map(tag => (
                    <li key={tag.id} className="modal-tags-manage-item" style={{'--tag-color': tag.color}}>
                        <input type="color" className="modal-tags-color" value={tag.color} disabled={isSaving}
                            title={t('tags.color')} onChange={ev => onColor(tag, ev.target.value)}/>
                        <input className="modal-tags-rename" defaultValue={tag.title} key={tag.id + tag.title}
                            disabled={isSaving}
                            onBlur={ev => onRename(tag, ev.target.value)}
                            onKeyDown={ev => {
                                if(ev.key === 'Enter') ev.currentTarget.blur()
                                if(ev.key === 'Escape'){
                                    ev.currentTarget.value = tag.title
                                    ev.currentTarget.blur()
                                }
                            }}/>
                        <span className="modal-tags-count">{usage[tag.id] || 0}</span>
                        <button type="button" className="modal-tags-icon" disabled={isSaving}
                            title={t('tags.merge')}
                            onClick={() => {
                                setPending({tag, mode: 'merge'})
                                const other = tags.find(x => x.id !== tag.id)
                                setMergeInto(other?other.id:'')
                            }}>
                            <Icon name="code-merge"/>
                        </button>
                        <button type="button" className="modal-tags-icon is-danger" disabled={isSaving}
                            title={t('common.delete')}
                            onClick={() => setPending({tag, mode: 'delete'})}>
                            <Icon name="trash-can" variant="fa-regular"/>
                        </button>
                    </li>
                ))}
                {!tags.length && <li className="modal-tags-none">{t('tags.none')}</li>}
            </ul>

            {pending && (
                <div className="modal-tags-confirm">
                    {pending.mode === 'merge'?(
                        <>
                            <p>{t('tags.mergeQuestion', {name: pending.tag.title, n: usage[pending.tag.id] || 0})}</p>
                            <select className="modal-tags-select" value={mergeInto}
                                onChange={ev => setMergeInto(ev.target.value)}>
                                {tags.filter(x => x.id !== pending.tag.id).map(x => (
                                    <option key={x.id} value={x.id}>#{x.title}</option>
                                ))}
                            </select>
                        </>
                    ):(
                        <p>{t('tags.deleteQuestion', {name: pending.tag.title, n: usage[pending.tag.id] || 0})}</p>
                    )}
                    <div className="modal-tags-confirm-tools">
                        <button type="button" onClick={() => setPending(null)}>{t('common.cancel')}</button>
                        <button type="button" className="is-primary" disabled={isSaving || (pending.mode === 'merge' && !mergeInto)}
                            onClick={onConfirm}>
                            {pending.mode === 'merge'?t('tags.merge'):t('common.delete')}
                        </button>
                    </div>
                </div>
            )}
        </section>
    )
}

function readErr(e){
    return e?.response?.data?.err || e?.message || t('common.unknownError')
}
