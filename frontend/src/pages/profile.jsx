import {useState, useRef} from 'react'
import {useSelector} from 'react-redux'
import {Link, useNavigate} from 'react-router-dom'

import {logout, updateProfile} from '../store/user.actions'
import {userService} from '../services/user.service'
import {confirmDelete} from '../cmps/confirm-dialog'
import {SessionList} from '../cmps/session-list'
import {uploadAvatar, imagesFromClipboard} from '../services/upload.service'
import {GUEST_IMG} from '../services/avatar'
import { Avatar } from '../cmps/avatar'
import {availableLanguages, getLanguage, languageName, setLanguage, t} from '../i18n'

const readErr = e => e?.response?.data?.err || e?.message || t('common.unknownError')

export function ProfilePage(){
    const user = useSelector(storeState => storeState.userModule.user)
    const navigate = useNavigate()
    const fileInput = useRef()

    const [fullname, setFullname] = useState(user?.fullname || '')
    const [pw, setPw] = useState({current: '', next: '', repeat: ''})
    // What the account says, and only what the page happens to be showing if
    // the account says nothing yet. Not the other way round: somebody whose
    // browser already shows German still has to be able to pin German to the
    // account, and a selector that starts on the displayed language would
    // make that save look like a no-op.
    const [language, setLanguageChoice] = useState(user?.language || getLanguage())
    const [preview, setPreview] = useState(null)
    const [busy, setBusy] = useState(false)
    const [msg, setMsg] = useState(null)
    const [err, setErr] = useState(null)

    if(!user) return null

    function flash(text){
        setMsg(text);
        setErr(null);
        setTimeout(() => setMsg(null), 3500)
    }

    async function onSaveName(ev){
        ev.preventDefault();
        setErr(null);
        setBusy(true)
        try {
            await updateProfile(user._id, {fullname: fullname.trim()})
            flash(t('profile.nameSaved'))
        } catch(e) {
            setErr(readErr(e))
        } finally {
            setBusy(false)
        }
    }

    async function handleAvatarFile(file){
        setErr(null);
        setBusy(true)
        try {
            const {url} = await uploadAvatar(file)
            setPreview(url)
        } catch(e) {
            setErr(readErr(e))
        } finally {
            setBusy(false)
        }
    }

    async function onPickFile(ev){
        const input = ev.target
        const file = input.files?.[0]
        if(!file) return
        try {
            await handleAvatarFile(file)
        } finally {
        // Only after the work is done. Clearing the input detaches the File
        // from the data behind it — the object is still there, what it points
        // at is not — and the read then fails with InvalidStateError.
        // Clearing at all is on purpose: without it, picking the same file
        // twice in a row fires no change event.
            input.value = ''
        }
    }

    /** Paste an image from the clipboard — Ctrl+V anywhere on the page. */
    async function onPaste(ev){
        const [blob] = imagesFromClipboard(ev)
        if(blob) await handleAvatarFile(blob)
    }

    async function onSaveAvatar(){
        if(!preview) return
        setErr(null);
        setBusy(true)
        try {
            await updateProfile(user._id, {imgUrl: preview})
            setPreview(null)
            flash(t('profile.pictureSaved'))
        } catch(e) {
            setErr(readErr(e))
        } finally {
            setBusy(false)
        }
    }

    async function onRemoveAvatar(){
        setErr(null);
        setBusy(true)
        try {
            await updateProfile(user._id, {imgUrl: ''})
            setPreview(null)
            flash(t('profile.pictureRemoved'))
        } catch(e) {
            setErr(readErr(e))
        } finally {
            setBusy(false)
        }
    }

    /**
     * Save the language to the account, then switch the page over.
     *
     * In that order, and nothing after it: setLanguage loads the page again
     * whenever the choice is not what is already on screen, so anything
     * written below it may never run. The one case where it returns — the
     * account was blank and the pick matches what the browser was showing
     * anyway — is the case that needs the confirmation.
     */
    async function onSaveLanguage(ev){
        ev.preventDefault();
        setErr(null);
        setBusy(true)
        try {
            await updateProfile(user._id, {language})
            setLanguage(language)
            flash(t('language.saved'))
        } catch(e) {
            setErr(readErr(e))
        } finally {
            setBusy(false)
        }
    }

    async function onChangePassword(ev){
        ev.preventDefault();
        setErr(null)
        if(pw.next !== pw.repeat) return setErr(t('profile.passwordMismatch'))
        if(pw.next.length < 8) return setErr(t('profile.passwordTooShort'))
        setBusy(true)
        try {
            await updateProfile(user._id, {password: pw.next, currentPassword: pw.current})
            setPw({current: '', next: '', repeat: ''})
            // The server ends every session on a password change, this one
            // included — a password changed because somebody else knew it is
            // worth little while their tab is still open. So: say so, and go
            // to the login rather than let the next click fail with a 401.
            flash(t('profile.passwordChangedSignOut'))
            setTimeout(signOut, 1500)
        } catch(e) {
            setErr(readErr(e))
        } finally {
            setBusy(false)
        }
    }

    /** Local clean-up. The server has already invalidated the cookie. */
    async function signOut(){
        try {
            await logout()
        } catch(e) { /* the session is gone either way */
        }
        navigate('/auth/login', {replace: true})
    }

    async function onLogoutEverywhere(){
        const ok = await confirmDelete({
            what: t('profile.logoutAllWhat'),
            note: t('profile.logoutAllNote'),
            button: t('profile.logoutAll')
        })
        if(!ok) return
        setErr(null)
        setBusy(true)
        try {
            await userService.logoutEverywhere(user._id)
            await signOut()
        } catch(e) {
            setErr(readErr(e))
            setBusy(false)
        }
    }

    const shown = preview || user.imgUrl || GUEST_IMG

    return (
        <div className="profile-page" onPaste={onPaste}>
            <div className="profile-bar">
                <div className="profile-bar-user">
                    <span className="profile-bar-name">{user.fullname}</span>
                </div>
            </div>

            <div className="profile-main">
                <h1 className="profile-title">{t('nav.profile')}</h1>
                {err && <div className="profile-error">{err}</div>}
                {msg && <div className="profile-success">{msg}</div>}

                <div className="profile-card">
                    <h2 className="profile-section-title">{t('profile.picture')}</h2>
                    <p className="profile-hint">{t('profile.pictureHint')}</p>
                    <div className="profile-avatar-row">
                        <Avatar src={shown} className="profile-avatar"/>
                        <div className="profile-avatar-actions">
                            <button className="profile-btn-ghost" onClick={() => fileInput.current.click()} disabled={busy}>
                                {t('profile.choosePicture')}
                            </button>
                            {preview &&
                                <button className="profile-btn" onClick={onSaveAvatar} disabled={busy}>{t('common.save')}</button>}
                            {preview &&
                                <button className="profile-btn-ghost" onClick={() => setPreview(null)} disabled={busy}>{t('update.discard')}</button>}
                            {!preview && user.imgUrl &&
                                <button className="profile-btn-ghost" onClick={onRemoveAvatar} disabled={busy}>{t('common.remove')}</button>}
                        </div>
                    </div>
                    <input ref={fileInput} type="file" accept="image/*" onChange={onPickFile} className="profile-file-input"/>
                    {preview && <p className="profile-hint is-last">{t('profile.preview')}</p>}
                </div>

                <div className="profile-card">
                    <h2 className="profile-section-title">{t('common.name')}</h2>
                    <p className="profile-hint">{t('profile.nameHint')}</p>
                    <form onSubmit={onSaveName}>
                        <div className="profile-row">
                            <span className="profile-label">{t('profile.fullName')}</span>
                            <input className="profile-input" value={fullname} onChange={e => setFullname(e.target.value)} required/>
                        </div>
                        <div className="profile-row">
                            <span className="profile-label">{t('profile.usernameFixed')}</span>
                            <input className="profile-input is-locked" value={user.username || '—'} disabled/>
                        </div>
                        <button className="profile-btn" type="submit" disabled={busy || !fullname.trim()}>{t('profile.saveName')}</button>
                    </form>
                </div>

                <div className="profile-card">
                    <h2 className="profile-section-title">{t('profile.sessions')}</h2>
                    <p className="profile-hint">{t('profile.sessionsHint')}</p>
                    <SessionList userId={user._id} onCurrentEnded={signOut}/>
                    <button type="button" className="profile-btn-ghost" disabled={busy}
                        onClick={onLogoutEverywhere}>{t('profile.logoutAll')}</button>
                </div>

                <div className="profile-card">
                    <h2 className="profile-section-title">{t('language.title')}</h2>
                    <p className="profile-hint">{t('language.hint')}</p>
                    <form onSubmit={onSaveLanguage}>
                        <div className="profile-row">
                            <span className="profile-label">{t('language.select')}</span>
                            <select className="profile-input profile-select" value={language}
                                onChange={e => setLanguageChoice(e.target.value)}>
                                {availableLanguages().map(code =>
                                    <option key={code} value={code}>{languageName(code)}</option>)}
                            </select>
                        </div>
                        <button className="profile-btn" type="submit" disabled={busy}>{t('common.save')}</button>
                    </form>
                </div>

                <div className="profile-card">
                    <h2 className="profile-section-title">{t('profile.changePassword')}</h2>
                    <p className="profile-hint">{t('profile.passwordHint')}</p>
                    <form onSubmit={onChangePassword}>
                        <div className="profile-row">
                            <span className="profile-label">{t('profile.currentPassword')}</span>
                            <input className="profile-input" type="password" value={pw.current} onChange={e => setPw({
                                ...pw,
                                current: e.target.value
                            })} required/>
                        </div>
                        <div className="profile-row">
                            <span className="profile-label">{t('profile.newPassword')}</span>
                            <input className="profile-input" type="password" value={pw.next} onChange={e => setPw({
                                ...pw,
                                next: e.target.value
                            })} required/>
                        </div>
                        <div className="profile-row">
                            <span className="profile-label">{t('profile.repeatPassword')}</span>
                            <input className="profile-input" type="password" value={pw.repeat} onChange={e => setPw({
                                ...pw,
                                repeat: e.target.value
                            })} required/>
                        </div>
                        <button className="profile-btn" type="submit" disabled={busy}>{t('profile.changePassword')}</button>
                    </form>
                </div>
            </div>
        </div>
    )
}
