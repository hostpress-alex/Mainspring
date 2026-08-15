import { useState } from 'react'
import { t } from '../../i18n'

const S = {
    strip: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    thumbWrap: { position: 'relative', width: 92, height: 92, borderRadius: 6, overflow: 'hidden', border: '1px solid #e0e3ee', background: '#f6f7fb' },
    thumb: { width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in', display: 'block' },
    file: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid #e0e3ee', borderRadius: 6, background: '#f6f7fb', fontSize: 13, textDecoration: 'none', color: '#0073ea' },
    remove: { position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', cursor: 'pointer', lineHeight: '20px', padding: 0, fontSize: 13 },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, cursor: 'zoom-out' },
    full: { maxWidth: '92vw', maxHeight: '92vh', boxShadow: '0 6px 40px rgba(0,0,0,.5)' },
}

const isImage = a => (a.mime || '').startsWith('image/')

function prettySize (bytes) {
    if (!bytes && bytes !== 0) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Shows the attachments of an update. With onRemove, delete buttons appear —
 * that way the same strip serves both the draft and saved updates.
 */
export function AttachmentStrip ({ attachments = [], onRemove = null }) {
    const [lightbox, setLightbox] = useState(null)
    if (!attachments.length) return null

    return (
        <>
            <div style={S.strip}>
                {attachments.map(a => isImage(a) ? (
                    <div key={a._id} style={S.thumbWrap}>
                        <img src={a.url} alt={a.name || ''} title={a.name || ''} style={S.thumb}
                            onClick={() => setLightbox(a)} />
                        {onRemove && (
                            <button type='button' style={S.remove} title={t('common.remove')}
                                onMouseDown={ev => { ev.preventDefault(); onRemove(a._id) }}>×</button>
                        )}
                    </div>
                ) : (
                    <a key={a._id} href={a.url} target='_blank' rel='noreferrer' style={S.file}>
                        <span>{a.name || t('file.file')}</span>
                        <span style={{ color: '#676879' }}>{prettySize(a.size)}</span>
                        {onRemove && (
                            <button type='button' style={{ ...S.remove, position: 'static', background: '#c3c6d4' }}
                                title={t('common.remove')}
                                onMouseDown={ev => { ev.preventDefault(); ev.stopPropagation(); onRemove(a._id) }}>×</button>
                        )}
                    </a>
                ))}
            </div>

            {lightbox && (
                <div style={S.overlay} onClick={() => setLightbox(null)}>
                    <img src={lightbox.url} alt={lightbox.name || ''} style={S.full} />
                </div>
            )}
        </>
    )
}
