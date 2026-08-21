import {useCallback, useEffect, useState} from 'react'

import {tokenService, YEAR_MS} from '../../services/token.service'
import {confirmDialog} from '../confirm-dialog'
import {utilService} from '../../services/util.service'
import {Icon} from '../icon'
import {t} from '../../i18n'

/**
 * API tokens, per account.
 *
 * The point of this panel is that minting a key no longer needs curl. The
 * point of how it is built is the two seconds after minting one.
 *
 * **The raw token appears exactly once.** The server stores its SHA-256 and
 * cannot show it again. So it is displayed in a box that says so, with a copy
 * button — and it is held in nothing but this component's state: not
 * localStorage, not the address, not a variable outside React. It goes when
 * the panel does, which is the correct lifetime for something that cannot be
 * recovered and must not be lying around.
 *
 * Choosing the account is deliberately an explicit step with nothing
 * preselected. Minting a token on the wrong account is not a mistake you
 * notice: it works, and it works with somebody else's rights.
 */

/** What a token may live for. Not "forever": a key nobody looks at again is
 *  the one still working three jobs after the person who made it left. */
const LIFETIMES = [
    {key: '1y', ms: YEAR_MS},
    {key: '2y', ms: 2 * YEAR_MS}
]

export function TokenAdmin({users, onError, onFlash}){
    const [userId, setUserId] = useState('')
    const [tokens, setTokens] = useState([])
    const [form, setForm] = useState({name: '', lifetime: '1y'})
    const [fresh, setFresh] = useState(null)     // the one-time value
    const [copied, setCopied] = useState(false)
    const [isBusy, setIsBusy] = useState(false)

    const owner = users.find(u => String(u._id) === String(userId)) || null

    const reload = useCallback(async id => {
        if(!id){
            setTokens([])
            return
        }
        try {
            const answer = await tokenService.forUser(id)
            setTokens(answer.tokens || [])
        } catch(err) {
            onError(err)
        }
        // onError is stable enough here; re-creating this on every render
        // would restart the effect below on every keystroke in the name field.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        // A different account means the previous account's one-time value is
        // not on screen any more either.
        setFresh(null)
        setCopied(false)
        reload(userId)
    }, [userId, reload])

    async function onCreate(ev){
        ev.preventDefault()
        if(isBusy || !userId) return
        setIsBusy(true)
        onError(null)
        try {
            const life = LIFETIMES.find(l => l.key === form.lifetime) || LIFETIMES[0]
            const answer = await tokenService.create(userId, {name: form.name, ttlMs: life.ms})
            setFresh(answer.token)
            setCopied(false)
            setForm({name: '', lifetime: form.lifetime})
            await reload(userId)
        } catch(err) {
            onError(err)
        } finally {
            setIsBusy(false)
        }
    }

    async function onRevoke(entry){
        const ok = await confirmDialog({
            title: t('token.revokeTitle'),
            text: t('token.revokeText', {name: entry.name || entry.prefix}),
            note: t('token.revokeNote'),
            button: t('token.revoke'),
            danger: true
        })
        if(!ok) return
        onError(null)
        try {
            await tokenService.revoke(entry.id)
            onFlash(t('token.revoked', {name: entry.name || entry.prefix}))
            // If the value on screen belongs to the token just revoked, it is
            // no longer worth copying.
            if(fresh && fresh.startsWith(entry.prefix)) setFresh(null)
            await reload(userId)
        } catch(err) {
            onError(err)
        }
    }

    async function onCopy(){
        try {
            await navigator.clipboard.writeText(fresh)
            setCopied(true)
        } catch(err) {
            // No clipboard permission, or an insecure origin. Not worth an
            // error message — the value is on screen and selectable.
            setCopied(false)
        }
    }

    function stateOf(entry){
        if(entry.revokedAt) return {key: 'token.stateRevoked', className: 'is-off'}
        if(entry.expiresAt !== null && entry.expiresAt <= Date.now()) return {key: 'token.stateExpired', className: 'is-off'}
        return {key: 'token.stateActive', className: ''}
    }

    return (
        <>
            <div className="admin-card">
                <h2 className="admin-section-title">{t('token.heading')}</h2>
                <p className="admin-sub is-tight">{t('token.intro')}</p>

                <label className="admin-field">
                    <span className="admin-field-label">{t('token.account')}</span>
                    <select className="admin-input" value={userId} onChange={e => setUserId(e.target.value)}>
                        <option value="">{t('token.chooseAccount')}</option>
                        {users.map(u => (
                            <option key={u._id} value={u._id}>
                                {u.fullname} ({u.username}){u.isAdmin?` · ${t('admin.admin')}`:''}
                            </option>
                        ))}
                    </select>
                </label>

                {/* The dangerous case, said out loud. requireSession stops a
                    token minting more tokens, but an admin token still reaches
                    every board there is. */}
                {owner && owner.isAdmin &&
                    <p className="admin-warn">
                        <Icon name="triangle-exclamation" className="icon"/> {t('token.adminWarning')}
                    </p>}

                {owner &&
                    <form className="admin-form" onSubmit={onCreate}>
                        <input className="admin-input" placeholder={t('token.namePlaceholder')}
                            value={form.name} maxLength={190}
                            onChange={e => setForm({...form, name: e.target.value})} required/>
                        <select className="admin-input" value={form.lifetime}
                            onChange={e => setForm({...form, lifetime: e.target.value})}>
                            {LIFETIMES.map(l =>
                                <option key={l.key} value={l.key}>{t(`token.lifetime.${l.key}`)}</option>)}
                        </select>
                        <button className="admin-btn" type="submit" disabled={isBusy}>{t('token.create')}</button>
                    </form>}
            </div>

            {fresh &&
                <div className="admin-card is-fresh-token">
                    <h2 className="admin-section-title">{t('token.freshTitle')}</h2>
                    <p className="admin-sub is-tight">{t('token.freshOnce')}</p>
                    <div className="token-value">
                        <code className="token-code">{fresh}</code>
                        <button type="button" className="admin-btn-ghost" onClick={onCopy}>
                            <Icon name={copied?'check':'copy'} className="icon"/>
                            {copied?t('token.copied'):t('common.copy')}
                        </button>
                    </div>
                    <p className="admin-sub is-footnote">{t('token.freshHint')}</p>
                </div>}

            {owner &&
                <div className="admin-card">
                    <h2 className="admin-section-title">
                        {t('token.listHeading', {name: owner.fullname, n: tokens.length})}
                    </h2>
                    {tokens.length === 0
                        ?<p className="admin-muted is-plain">{t('token.none')}</p>
                        :<table className="admin-table">
                            <thead>
                                <tr>
                                    <th className="admin-th">{t('common.name')}</th>
                                    <th className="admin-th">{t('token.prefix')}</th>
                                    <th className="admin-th">{t('token.lastUsed')}</th>
                                    <th className="admin-th">{t('token.expires')}</th>
                                    <th className="admin-th">{t('common.state')}</th>
                                    <th className="admin-th"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {tokens.map(entry => {
                                    const state = stateOf(entry)
                                    return (
                                        <tr key={entry.id}>
                                            <td className="admin-td">{entry.name || '—'}</td>
                                            <td className="admin-td"><code>{entry.prefix}…</code></td>
                                            <td className="admin-td">
                                                {/* "never used" is the answer that says a
                                                    deployment did not work. */}
                                                {entry.lastUsedAt
                                                    ?utilService.calculateTimeWithBefore(entry.lastUsedAt)
                                                    :<span className="admin-muted is-plain">{t('token.neverUsed')}</span>}
                                            </td>
                                            <td className="admin-td">
                                                {entry.expiresAt?utilService.getFormattedDate(entry.expiresAt):'—'}
                                            </td>
                                            <td className="admin-td">
                                                <span className={`admin-badge ${state.className}`}>{t(state.key)}</span>
                                            </td>
                                            <td className="admin-td is-right">
                                                {!entry.revokedAt &&
                                                    <button className="admin-btn-danger" onClick={() => onRevoke(entry)}>
                                                        {t('token.revoke')}
                                                    </button>}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>}
                    <p className="admin-sub is-footnote">{t('token.listFootnote')}</p>
                </div>}
        </>
    )
}
