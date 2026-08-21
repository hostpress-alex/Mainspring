import {useCallback, useEffect, useState} from 'react'

import {Icon} from '../icon'
import {Avatar} from '../avatar'
import {FilePreview} from '../file-preview'
import {fileType, fileSize} from './file-type'
import {canPreview} from '../../services/preview'
import {boardService} from '../../services/board.service'
import {localErrorText} from '../../services/error-text'
import * as boardRoles from '../../services/board-roles'
import {fmtRelative} from '../../services/date.util'
import {t} from '../../i18n'

/**
 * Everything that was ever uploaded to this task.
 *
 * Two lists, not one, and the split is the whole point. Files reach a task by
 * three routes — attached under an update, pasted into the text of one, or as
 * the value of a file column — and nothing has ever deleted a `file` row. So
 * the table also holds uploads that were dropped from a draft before it was
 * posted, and ones whose update was deleted afterwards.
 *
 * A flat list of all of them shows files that cannot be found anywhere in the
 * task, with no explanation, which reads as a fault. Showing only the used
 * ones would hide the rest on the disk forever. So: what is in use, with where
 * it is used, and underneath what is not, where it can be got rid of.
 *
 * Where each file is used is worked out on the server (`board.service.taskFiles`)
 * — the same answer decides whether a delete is allowed, and two
 * implementations of it would eventually disagree.
 */
export function TaskFiles({board, task, user}){
    const [files, setFiles] = useState(null)
    const [err, setErr] = useState(null)
    const [busyId, setBusyId] = useState(null)
    const [preview, setPreview] = useState(null)
    const mayDelete = boardRoles.canEdit(board, user)

    const load = useCallback(async () => {
        setErr(null)
        try {
            setFiles(await boardService.getTaskFiles(board._id, task.id))
        } catch(e) {
            setErr(localErrorText(e))
            setFiles([])
        }
    }, [board._id, task.id])

    useEffect(() => {
        load()
    }, [load])

    async function onRemove(file){
        setErr(null)
        setBusyId(file.id)
        try {
            await boardService.removeTaskFile(board._id, task.id, file.id)
            setFiles(prev => (prev || []).filter(f => f.id !== file.id))
        } catch(e) {
            // A 409 means somebody attached it again while this list was open.
            // Reloading is the honest answer: the list was out of date, and
            // saying so without correcting it would leave the same button
            // failing again.
            setErr(localErrorText(e))
            await load()
        } finally {
            setBusyId(null)
        }
    }

    if(files === null) return <div className="task-files is-loading">{t('common.loading')}</div>

    const used = files.filter(file => file.sources.length > 0)
    const unused = files.filter(file => !file.sources.length)

    return (
        <section className="task-files">
            {preview && <FilePreview file={preview} onClose={() => setPreview(null)}/>}
            {err && <div className="task-files-error">{err}</div>}

            {!files.length && <p className="task-files-empty">{t('file.noneInTask')}</p>}

            {used.length > 0 && (
                <ul className="task-files-list">
                    {used.map(file => (
                        <FileRow key={file.id} file={file} board={board}
                            onPreview={() => setPreview(file)}/>
                    ))}
                </ul>
            )}

            {unused.length > 0 && (
                <>
                    <header className="task-files-head">
                        <h4>{t('file.unusedTitle')}</h4>
                        <p>{t('file.unusedHint')}</p>
                    </header>
                    <ul className="task-files-list is-unused">
                        {unused.map(file => (
                            <FileRow key={file.id} file={file} board={board}
                                onPreview={() => setPreview(file)}
                                onRemove={mayDelete?() => onRemove(file):null}
                                isBusy={busyId === file.id}/>
                        ))}
                    </ul>
                </>
            )}
        </section>
    )
}

/** One file: what it is, who put it there, and where it is used. */
function FileRow({file, board, onPreview, onRemove = null, isBusy = false}){
    const type = fileType(file)
    const person = (board.members || []).find(m => String(m._id) === String(file.uploadedBy))

    return (
        <li className={`task-file is-${type.key}`}>
            <Icon name={type.faIcon} className="task-file-icon"/>

            <div className="task-file-main">
                <span className="task-file-name" title={file.name}>{file.name || t('file.file')}</span>
                <span className="task-file-meta">
                    {[fileSize(file.size), file.createdAt?fmtRelative(file.createdAt):'']
                        .filter(Boolean).join(' · ')}
                </span>
                {file.sources.length > 0 && (
                    <span className="task-file-where">{describeSources(file.sources)}</span>
                )}
            </div>

            {person && <Avatar className="task-file-who" src={person.imgUrl} title={person.fullname}/>}

            <div className="task-file-actions">
                {canPreview(file) && (
                    <button type="button" onClick={onPreview} title={t('common.open')}>
                        <Icon name='eye'/>
                    </button>
                )}
                {/* A plain link, so the browser's own download path is used and
                    the server's Content-Disposition decides the filename. */}
                <a href={file.url} download={file.name || undefined} title={t('file.download')}>
                    <Icon name='download'/>
                </a>
                {onRemove && (
                    <button type="button" className="is-danger" disabled={isBusy}
                        onClick={onRemove} title={t('common.delete')}>
                        <Icon name={isBusy?'spinner':'trash'}/>
                    </button>
                )}
            </div>
        </li>
    )
}

/**
 * "In an update", "in the text of an update", "in the column X" — counted
 * rather than listed. A file pasted into six updates would otherwise turn one
 * row into six lines of the same sentence.
 */
function describeSources(sources){
    const counts = {attachment: 0, text: 0, column: 0}
    const fields = []
    for(const source of sources){
        counts[source.kind] = (counts[source.kind] || 0) + 1
        if(source.kind === 'column' && source.field) fields.push(source.field)
    }

    const parts = []
    if(counts.attachment) parts.push(t('file.usedInUpdate', {n: counts.attachment}))
    if(counts.text) parts.push(t('file.usedInText', {n: counts.text}))
    if(counts.column) parts.push(t('file.usedInColumn', {n: counts.column}))
    return parts.join(' · ')
}
