import {useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'

import {Icon} from './icon'
import {fileType, fileSize} from './task/file-type'
import {previewKind, parseCsv, formatText, MAX_TEXT_BYTES, MAX_TEXT_CHARS, MAX_CSV_ROWS} from '../services/preview'
import {t} from '../i18n'

/**
 * One overlay for looking at an attachment.
 *
 * Images and PDF are handed to the browser, which is what it is good at. Every
 * text format is fetched and rendered as React nodes — never as markup, and
 * never in an iframe. An uploaded file shown in an iframe from our own origin
 * runs in our origin, and the difference between "shows a document" and "runs
 * a script with the user's session" is exactly that decision.
 *
 * It renders into `document.body` through a portal. Everything that has to
 * float above the whole page does — a z-index is only compared inside the
 * stacking context it sits in, and the strip this opens from sits in several.
 * See CLAUDE.md, "Layering".
 *
 * Downloading stays possible from here for every type, including the ones the
 * browser is showing: looking at a file and keeping it are different wishes.
 */
export function FilePreview({file, onClose}){
    const kind = previewKind(file)
    const [text, setText] = useState(null)
    const [err, setErr] = useState(null)
    const [isLoading, setIsLoading] = useState(false)
    const elPanel = useRef(null)

    useEffect(() => {
        function onKey(ev){
            if(ev.key === 'Escape') onClose()
        }

        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    // Text formats are read by us. `fetch` gets the body whatever
    // Content-Disposition says, so the server can go on sending everything
    // except images and PDF as a download.
    useEffect(() => {
        if(kind !== 'text' && kind !== 'csv') return
        let isCurrent = true
        setIsLoading(true)
        setErr(null)

        fetch(file.url, {credentials: 'include'})
            .then(res => {
                if(!res.ok) throw new Error(`HTTP ${res.status}`)
                const size = Number(res.headers.get('content-length') || file.size || 0)
                if(size > MAX_TEXT_BYTES) throw Object.assign(new Error('too big'), {tooBig: true})
                return res.text()
            })
            .then(body => {
                if(!isCurrent) return
                setText(body)
            })
            .catch(error => {
                if(!isCurrent) return
                setErr(error.tooBig?t('preview.tooBig'):t('preview.failed'))
            })
            .finally(() => {
                if(isCurrent) setIsLoading(false)
            })

        return () => {
            isCurrent = false
        }
    }, [file.url, file.size, kind])

    const type = fileType(file)

    return createPortal(
        <div className="file-preview-overlay" onMouseDown={ev => {
            // Only a click on the backdrop itself, not one that started inside
            // the panel and ended out here after a text selection.
            if(!elPanel.current || !elPanel.current.contains(ev.target)) onClose()
        }}>
            <section className="file-preview" ref={elPanel} role="dialog" aria-label={file.name || t('file.file')}>
                <header className="file-preview-head">
                    <Icon name={type.faIcon} className={`file-preview-icon is-${type.key}`}/>
                    <span className="file-preview-name" title={file.name || ''}>{file.name || t('file.file')}</span>
                    {file.size > 0 && <span className="file-preview-size">{fileSize(file.size)}</span>}

                    <a className="file-preview-download" href={file.url} download={file.name || true} title={t('preview.download')}>
                        <Icon name='download'/>
                        <span>{t('preview.download')}</span>
                    </a>
                    <button type="button" className="file-preview-close" onClick={onClose} title={t('common.close')}>
                        <Icon name='xmark'/>
                    </button>
                </header>

                <div className={`file-preview-body is-${kind}`}>
                    {kind === 'image' &&
                        <img src={file.url} alt={file.name || ''} className="file-preview-image"/>}

                    {kind === 'pdf' &&
                        // The browser's own viewer. It brings paging, search and
                        // printing, and none of that is worth rebuilding.
                        <iframe src={file.url} title={file.name || 'PDF'} className="file-preview-frame"/>}

                    {(kind === 'text' || kind === 'csv') && (
                        <>
                            {isLoading && <p className="file-preview-note">{t('common.loading')}</p>}
                            {err && <p className="file-preview-note is-error">{err}</p>}
                            {!isLoading && !err && text !== null &&
                                (kind === 'csv'?<CsvTable text={text}/>:<TextBody file={file} text={text}/>)}
                        </>
                    )}

                    {kind === 'none' && (
                        <p className="file-preview-note">
                            {t('preview.noPreview')}
                        </p>
                    )}
                </div>
            </section>
        </div>,
        document.body
    )
}

/**
 * A CSV as a table, first row as the header.
 *
 * Assuming a header row is a guess, and a wrong one costs one row that looks
 * like a heading — against every file that does have one and would otherwise
 * be a wall of equal-looking cells.
 */
function CsvTable({text}){
    const {rows, truncated} = parseCsv(text)
    if(!rows.length) return <p className="file-preview-note">{t('preview.empty')}</p>

    const [head, ...body] = rows
    return (
        <>
            <div className="file-preview-table-wrap">
                <table className="file-preview-table">
                    <thead>
                        <tr>{head.map((cell, i) => <th key={i}>{cell}</th>)}</tr>
                    </thead>
                    <tbody>
                        {body.map((row, r) => (
                            <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {truncated && (
                <p className="file-preview-note">
                    {t('preview.truncatedRows', {n: MAX_CSV_ROWS})}
                </p>
            )}
        </>
    )
}

function TextBody({file, text}){
    const ext = String(file.name || '').split('.').pop().toLowerCase()
    const shown = formatText(text, ext)
    const isCut = shown.length > MAX_TEXT_CHARS

    return (
        <>
            <pre className="file-preview-text">{isCut?shown.slice(0, MAX_TEXT_CHARS):shown}</pre>
            {isCut && <p className="file-preview-note">{t('preview.truncatedText')}</p>}
        </>
    )
}
