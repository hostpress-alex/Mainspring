import {useState} from 'react'
import {t} from '../../i18n'

const isImage = a => (a.mime || '').startsWith('image/')

function prettySize(bytes){
    if(!bytes && bytes !== 0) return ''
    if(bytes < 1024) return `${bytes} B`
    if(bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Shows the attachments of an update. With onRemove, delete buttons appear —
 * that way the same strip serves both the draft and saved updates.
 */
export function AttachmentStrip({attachments = [], onRemove = null}){
    const [lightbox, setLightbox] = useState(null)
    if(!attachments.length) return null

    return (
        <>
            <div className="attachment-strip">
                {attachments.map(a => isImage(a)?(
                    <div key={a._id} className="attachment-thumb-wrap">
                        <img src={a.url} alt={a.name || ''} title={a.name || ''} className="attachment-thumb" onClick={() => setLightbox(a)}/>
                        {onRemove && (
                            <button type="button" className="attachment-remove" title={t('common.remove')} onMouseDown={ev => {
                                ev.preventDefault();
                                onRemove(a._id)
                            }}>×</button>
                        )}
                    </div>
                ):(
                    <a key={a._id} href={a.url} target="_blank" rel="noreferrer" className="attachment-file">
                        <span>{a.name || t('file.file')}</span>
                        <span className="attachment-size">{prettySize(a.size)}</span>
                        {onRemove && (
                            <button type="button" className="attachment-remove is-inline" title={t('common.remove')} onMouseDown={ev => {
                                ev.preventDefault();
                                ev.stopPropagation();
                                onRemove(a._id)
                            }}>×</button>
                        )}
                    </a>
                ))}
            </div>

            {lightbox && (
                <div className="attachment-overlay" onClick={() => setLightbox(null)}>
                    <img src={lightbox.url} alt={lightbox.name || ''} className="attachment-full"/>
                </div>
            )}
        </>
    )
}
