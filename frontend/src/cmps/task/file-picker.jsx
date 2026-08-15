import { useRef, useState } from 'react'
import { AiOutlineFileAdd } from 'react-icons/ai'
import { uploadFile } from '../../services/upload.service'
import { t } from '../../i18n'

/**
 * File column.
 *
 * Everything used to go through uploadImg(), which treated every file as an
 * image and scaled it down — PDFs and Word files were simply turned away. Now
 * the file is uploaded unchanged; images get a thumbnail, everything else an
 * icon with its name.
 *
 * The stored value is an object { url, name, mime, size }. Older data is a
 * bare URL and is still understood.
 */

const ACCEPT = [
    'image/*', '.pdf', '.doc', '.docx', '.odt', '.rtf',
    '.xls', '.xlsx', '.ods', '.csv',
    '.ppt', '.pptx', '.odp',
    '.txt', '.md', '.json', '.xml', '.zip', '.7z',
].join(',')

/** Normalise the value: this used to be nothing but a URL. */
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
            setErr(e.message || t('file.uploadFailed'))
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
        <section className="file-picker picker" title={err || (file ? (file.name || t('file.file')) : t('file.attach'))}>
            {!file && (
                <label htmlFor={'file-upload' + info.id} className="file-picker-add">
                    {isBusy ? <span className="file-picker-busy">…</span> : <AiOutlineFileAdd className="icon" />}
                </label>
            )}

            {file && (
                <span className="file-picker-body">
                    <a href={file.url} target="_blank" rel="noreferrer" className="file-picker-link"
                        onClick={ev => ev.stopPropagation()}>
                        {isImage
                            ? <img className="file-img" src={file.url} alt="" />
                            : <AiOutlineFileAdd className="icon" />}
                        {!isImage && file.name && (
                            <span className="file-picker-name">
                                {shortName(file.name)}
                            </span>
                        )}
                    </a>
                    <button type="button" title={t('file.remove')} onClick={onClear} className="file-picker-clear">
                        ×
                    </button>
                </span>
            )}

            <input ref={elInput} type="file" accept={ACCEPT} onChange={onPick}
                id={'file-upload' + info.id} className="file-picker-input" />
        </section>
    )
}
