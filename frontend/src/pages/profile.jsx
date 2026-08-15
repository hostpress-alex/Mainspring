import { useState, useRef } from 'react'
import { useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'

import { updateProfile } from '../store/user.actions'
import { uploadAvatar, imagesFromClipboard } from '../services/upload.service'
import { GUEST_IMG } from '../services/avatar'
import { t } from '../i18n'

const S = {
    page: { minHeight: '100vh', background: '#f6f7fb' },
    bar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 32px', background: '#fff', borderBottom: '1px solid #e6e9ef' },
    main: { maxWidth: 720, margin: '0 auto', padding: '32px 32px 64px' },
    h1: { fontSize: 26, margin: '0 0 24px' },
    card: { background: '#fff', border: '1px solid #e0e3ee', borderRadius: 10, padding: 22, marginBottom: 22 },
    h2: { fontSize: 17, margin: '0 0 4px' },
    hint: { color: '#676879', fontSize: 13, margin: '0 0 16px' },
    row: { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 },
    label: { fontSize: 13, color: '#676879' },
    input: { padding: '9px 12px', border: '1px solid #c3c6d4', borderRadius: 6, fontSize: 14, maxWidth: 380 },
    btn: { padding: '9px 18px', border: 'none', borderRadius: 6, background: '#0073ea', color: '#fff', cursor: 'pointer', fontSize: 14 },
    btnGhost: { padding: '8px 14px', border: '1px solid #c3c6d4', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 14 },
    avatarRow: { display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14 },
    avatar: { width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', border: '1px solid #e0e3ee' },
    err: { background: '#fff0f2', border: '1px solid #e2445c', color: '#a3283a', padding: '10px 14px', borderRadius: 6, marginBottom: 16 },
    ok: { background: '#eefaf3', border: '1px solid #00c875', color: '#00734a', padding: '10px 14px', borderRadius: 6, marginBottom: 16 },
    link: { color: '#0073ea', textDecoration: 'none' },
}

const readErr = e => e?.response?.data?.err || e?.message || t('common.unknownError')

export function ProfilePage () {
    const user = useSelector(storeState => storeState.userModule.user)
    const navigate = useNavigate()
    const fileInput = useRef()

    const [fullname, setFullname] = useState(user?.fullname || '')
    const [pw, setPw] = useState({ current: '', next: '', repeat: '' })
    const [preview, setPreview] = useState(null)
    const [busy, setBusy] = useState(false)
    const [msg, setMsg] = useState(null)
    const [err, setErr] = useState(null)

    if (!user) return null

    function flash (text) { setMsg(text); setErr(null); setTimeout(() => setMsg(null), 3500) }

    async function onSaveName (ev) {
        ev.preventDefault(); setErr(null); setBusy(true)
        try {
            await updateProfile(user._id, { fullname: fullname.trim() })
            flash(t('profile.nameSaved'))
        } catch (e) { setErr(readErr(e)) } finally { setBusy(false) }
    }

    async function handleAvatarFile (file) {
        setErr(null); setBusy(true)
        try {
            const { url } = await uploadAvatar(file)
            setPreview(url)
        } catch (e) { setErr(readErr(e)) } finally { setBusy(false) }
    }

    async function onPickFile (ev) {
        const file = ev.target.files?.[0]
        ev.target.value = ''
        if (file) await handleAvatarFile(file)
    }

    /** Paste an image from the clipboard — Ctrl+V anywhere on the page. */
    async function onPaste (ev) {
        const [blob] = imagesFromClipboard(ev)
        if (blob) await handleAvatarFile(blob)
    }

    async function onSaveAvatar () {
        if (!preview) return
        setErr(null); setBusy(true)
        try {
            await updateProfile(user._id, { imgUrl: preview })
            setPreview(null)
            flash(t('profile.pictureSaved'))
        } catch (e) { setErr(readErr(e)) } finally { setBusy(false) }
    }

    async function onRemoveAvatar () {
        setErr(null); setBusy(true)
        try {
            await updateProfile(user._id, { imgUrl: '' })
            setPreview(null)
            flash(t('profile.pictureRemoved'))
        } catch (e) { setErr(readErr(e)) } finally { setBusy(false) }
    }

    async function onChangePassword (ev) {
        ev.preventDefault(); setErr(null)
        if (pw.next !== pw.repeat) return setErr(t('profile.passwordMismatch'))
        if (pw.next.length < 8) return setErr(t('profile.passwordTooShort'))
        setBusy(true)
        try {
            await updateProfile(user._id, { password: pw.next, currentPassword: pw.current })
            setPw({ current: '', next: '', repeat: '' })
            flash(t('profile.passwordChanged'))
        } catch (e) { setErr(readErr(e)) } finally { setBusy(false) }
    }

    const shown = preview || user.imgUrl || GUEST_IMG

    return (
        <div style={S.page} onPaste={onPaste}>
            <div style={S.bar}>
                <div style={{ display: 'flex', gap: 16, fontSize: 14, alignItems: 'center' }}>
                    <span style={{ color: '#676879' }}>{user.fullname}</span>
                </div>
            </div>

            <div style={S.main}>
                <h1 style={S.h1}>{t('nav.profile')}</h1>
                {err && <div style={S.err}>{err}</div>}
                {msg && <div style={S.ok}>{msg}</div>}

                <div style={S.card}>
                    <h2 style={S.h2}>{t('profile.picture')}</h2>
                    <p style={S.hint}>
                        Wird im Browser auf 256×256 verkleinert und auf deinem Server gespeichert.
                        Du kannst ein Bild auch einfach mit Strg+V einfuegen.
                    </p>
                    <div style={S.avatarRow}>
                        <img src={shown} alt='' style={S.avatar} />
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <button style={S.btnGhost} onClick={() => fileInput.current.click()} disabled={busy}>
                                Bild waehlen
                            </button>
                            {preview && <button style={S.btn} onClick={onSaveAvatar} disabled={busy}>{t('common.save')}</button>}
                            {preview && <button style={S.btnGhost} onClick={() => setPreview(null)} disabled={busy}>{t('update.discard')}</button>}
                            {!preview && user.imgUrl && <button style={S.btnGhost} onClick={onRemoveAvatar} disabled={busy}>{t('common.remove')}</button>}
                        </div>
                    </div>
                    <input ref={fileInput} type='file' accept='image/*' onChange={onPickFile} style={{ display: 'none' }} />
                    {preview && <p style={{ ...S.hint, marginBottom: 0 }}>{t('profile.preview')}</p>}
                </div>

                <div style={S.card}>
                    <h2 style={S.h2}>{t('common.name')}</h2>
                    <p style={S.hint}>{t('profile.nameHint')}</p>
                    <form onSubmit={onSaveName}>
                        <div style={S.row}>
                            <span style={S.label}>{t('profile.fullName')}</span>
                            <input style={S.input} value={fullname} onChange={e => setFullname(e.target.value)} required />
                        </div>
                        <div style={S.row}>
                            <span style={S.label}>{t('profile.usernameFixed')}</span>
                            <input style={{ ...S.input, background: '#f6f7fb', color: '#676879' }}
                                value={user.username || '—'} disabled />
                        </div>
                        <button style={S.btn} type='submit' disabled={busy || !fullname.trim()}>{t('profile.saveName')}</button>
                    </form>
                </div>

                <div style={S.card}>
                    <h2 style={S.h2}>{t('profile.changePassword')}</h2>
                    <p style={S.hint}>{t('profile.passwordHint')}</p>
                    <form onSubmit={onChangePassword}>
                        <div style={S.row}>
                            <span style={S.label}>{t('profile.currentPassword')}</span>
                            <input style={S.input} type='password' value={pw.current}
                                onChange={e => setPw({ ...pw, current: e.target.value })} required />
                        </div>
                        <div style={S.row}>
                            <span style={S.label}>{t('profile.newPassword')}</span>
                            <input style={S.input} type='password' value={pw.next}
                                onChange={e => setPw({ ...pw, next: e.target.value })} required />
                        </div>
                        <div style={S.row}>
                            <span style={S.label}>{t('profile.repeatPassword')}</span>
                            <input style={S.input} type='password' value={pw.repeat}
                                onChange={e => setPw({ ...pw, repeat: e.target.value })} required />
                        </div>
                        <button style={S.btn} type='submit' disabled={busy}>{t('profile.changePassword')}</button>
                    </form>
                </div>
            </div>
        </div>
    )
}
