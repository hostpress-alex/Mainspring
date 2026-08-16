import {useState} from 'react'

import {FilePreview} from '../file-preview'
import {canPreview} from '../../services/preview'
import {fileSize} from './file-type'
import {t} from '../../i18n'

const isImage = a => (a.mime || '').startsWith('image/')

/**
 * Shows the attachments of an update. With onRemove, delete buttons appear —
 * that way the same strip serves both the draft and saved updates.
 *
 * Anything that can be shown opens in the preview overlay instead of leaving
 * the page. What cannot stays an ordinary link and downloads, which is the
 * honest outcome for a .zip. The decision lives in services/preview.js so the
 * file column and this strip cannot drift apart on what is previewable.
 */
export function AttachmentStrip({attachments = [], onRemove = null}){
    const [preview, setPreview] = useState(null)
    if(!attachments.length) return null

    return (
        <>
            <div className="attachment-strip">
                {attachments.map(a => isImage(a)?(
                    <div key={a._id} className="attachment-thumb-wrap">
                        <img src={a.url} alt={a.name || ''} title={a.name || ''} className="attachment-thumb" onClick={() => setPreview(a)}/>
                        {onRemove && (
                            <button type="button" className="attachment-remove" title={t('common.remove')} onMouseDown={ev => {
                                ev.preventDefault()
                                onRemove(a._id)
                            }}>×</button>
                        )}
                    </div>
                ):canPreview(a)?(
                    // A button, not a link: it opens something on this page.
                    // A link that does not navigate is a lie to anyone using a
                    // keyboard or a screen reader.
                    <button type="button" key={a._id} className="attachment-file" onClick={() => setPreview(a)}>
                        <span>{a.name || t('file.file')}</span>
                        <span className="attachment-size">{fileSize(a.size)}</span>
                        {onRemove && (
                            <span className="attachment-remove is-inline" title={t('common.remove')} onMouseDown={ev => {
                                ev.preventDefault()
                                ev.stopPropagation()
                                onRemove(a._id)
                            }}>×</span>
                        )}
                    </button>
                ):(
                    <a key={a._id} href={a.url} target="_blank" rel="noreferrer" className="attachment-file">
                        <span>{a.name || t('file.file')}</span>
                        <span className="attachment-size">{fileSize(a.size)}</span>
                        {onRemove && (
                            <button type="button" className="attachment-remove is-inline" title={t('common.remove')} onMouseDown={ev => {
                                ev.preventDefault()
                                ev.stopPropagation()
                                onRemove(a._id)
                            }}>×</button>
                        )}
                    </a>
                ))}
            </div>

            {preview && <FilePreview file={preview} onClose={() => setPreview(null)}/>}
        </>
    )
}
