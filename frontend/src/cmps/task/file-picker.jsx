import { useRef, useState } from 'react'
import { AiOutlineFileAdd } from 'react-icons/ai'
import { uploadFile } from '../../services/upload.service'

/**
 * Datei-Spalte.
 *
 * Frueher lief hier alles ueber uploadImg(), das jede Datei als Bild behandelt
 * und verkleinert hat — PDFs und Word-Dateien wurden schlicht abgewiesen.
 * Jetzt wird die Datei unveraendert hochgeladen; Bilder bekommen ein
 * Vorschaubild, alles andere ein Symbol mit Namen.
 *
 * Der gespeicherte Wert ist ein Objekt { url, name, mime, size }. Altbestand
 * ist eine blanke URL und wird weiter verstanden.
 */

const ACCEPT = [
    'image/*', '.pdf', '.doc', '.docx', '.odt', '.rtf',
    '.xls', '.xlsx', '.ods', '.csv',
    '.ppt', '.pptx', '.odp',
    '.txt', '.md', '.json', '.xml', '.zip', '.7z',
].join(',')

/** Wert normalisieren: frueher stand hier nur eine URL. */
function asFile(value) {
    if (!value) return null
    if (typeof value === 'string') return { url: value, name: '', mime: '', size: 0 }
    if (typeof value === 'object' && value.url) return value
    return null
}

function shortName(name) {
    const clean = String(name || '')
    if (clean.length <= 18) return clean
    const dot = clean.lastIndexOf('.')
    const ext = dot > 0 ? clean.slice(dot) : ''
    return clean.slice(0, 14 - ext.length) + '…' + ext
}

export function FilePicker({ info, onUpdate, field = 'file' }) {
    const [isBusy, setIsBusy] = useState(false)
    const [err, setErr] = useState(null)
    const elInput = useRef()
    const file = asFile(info[field])
    const isImage = file && (file.mime ? file.mime.startsWith('image/') : /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.url))

    async function onPick(ev) {
        const picked = ev.target.files && ev.target.files[0]
        ev.target.value = ''
        if (!picked) return
        setErr(null)
        setIsBusy(true)
        try {
            const saved = await uploadFile(picked, { scope: 'task', taskId: info.id, name: picked.name })
            onUpdate(field, {
                url: saved.url,
                name: saved.name || picked.name || '',
                mime: saved.mime || picked.type || '',
                size: saved.size || picked.size || 0,
            })
        } catch (e) {
            setErr(e.message || 'Upload fehlgeschlagen')
        } finally {
            setIsBusy(false)
        }
    }

    function onClear(ev) {
        ev.preventDefault()
        ev.stopPropagation()
        onUpdate(field, '')
    }

    return (
        <section className="file-picker picker" title={err || (file ? (file.name || 'Datei') : 'Datei anhängen')}>
            {!file && (
                <label htmlFor={'file-upload' + info.id} style={{ cursor: 'pointer' }}>
                    {isBusy ? <span style={{ fontSize: 11, color: '#676879' }}>…</span> : <AiOutlineFileAdd className="icon" />}
                </label>
            )}

            {file && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
                    <a href={file.url} target="_blank" rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, textDecoration: 'none', color: '#0073ea' }}
                        onClick={ev => ev.stopPropagation()}>
                        {isImage
                            ? <img className="file-img" src={file.url} alt="" style={{ maxWidth: 19, maxHeight: 19, display: 'block' }} />
                            : <AiOutlineFileAdd className="icon" />}
                        {!isImage && file.name && (
                            <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {shortName(file.name)}
                            </span>
                        )}
                    </a>
                    <button type="button" title="Datei entfernen" onClick={onClear}
                        style={{ border: 'none', background: 'transparent', color: '#676879', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 13 }}>
                        ×
                    </button>
                </span>
            )}

            <input ref={elInput} type="file" accept={ACCEPT} onChange={onPick}
                id={'file-upload' + info.id} style={{ display: 'none' }} />
        </section>
    )
}
