import {useCallback, useEffect, useState} from 'react'

import {tokenService, YEAR_MS} from '../../services/token.service'
import {confirmDialog} from '../confirm-dialog'
import {utilService} from '../../services/util.service'
import {fmtSpan} from '../../services/date.util'
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
 *
 * **The list below shows every token there is, always.** The first version
 * only listed the chosen account's, so a reload showed nothing at all until
 * you picked somebody — and the question this page is opened for is "which
 * keys exist", not "which keys does this one account have". An answer that has
 * to be assembled by clicking through eight accounts is an answer nobody has.
 * The picker now only decides who a NEW token is for.
 */

/**
 * What a token may live for. Not "forever": a key nobody looks at again is the
 * one still working three jobs after the person who made it left.
 *
 * Derived from the numbers, not written out per entry. The hand-written
 * version had `{key: '3y', ms: 2 * YEAR_MS}` and the same for '5y' — a copied
 * line whose label was changed and whose value was not, so the menu offered
 * five years and handed out two. A dropdown that lies about what it does is
 * worse than a dropdown with fewer options, and nothing on screen afterwards
 * would have contradicted it. Here the label and the value cannot disagree,
 * because there is only one number.
 *
 * The longest one has to stay within what the server allows — see MAX_TTL_MS
 * in api/token/token.controller. The server no longer clamps silently, so a
 * mismatch is a 400 rather than a quiet difference.
 */
export const LIFETIME_YEARS = [1, 2, 3, 5]

const LIFETIMES = LIFETIME_YEARS.map(years => ({
    key: `${years}y`,
    years,
    ms: years * YEAR_MS
}))

export function TokenAdmin({users, onError, onFlash}){
    const [userId, setUserId] = useState('')
    const [tokens, setTokens] = useState([])
    const [isLoaded, setIsLoaded] = useState(false)
    const [form, setForm] = useState({name: '', lifetime: '1y'})
    const [fresh, setFresh] = useState(null)     // the one-time value
    const [copied, setCopied] = useState(false)
    const [isBusy, setIsBusy] = useState(false)

    const owner = users.find(u => String(u._id) === String(userId)) || null

    const reload = useCallback(async () => {
        try {
            const answer = await tokenService.all()
            setTokens(answer.tokens || [])
        } catch(err) {
            onError(err)
        } finally {
            setIsLoaded(true)
        }
        // onError is stable enough here; re-creating this on every render
        // would restart the effect below on every keystroke in the name field.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        reload()
    }, [reload])

    useEffect(() => {
        // A different account means the previous account's one-time value is
        // not on screen any more either.
        setFresh(null)
        setCopied(false)
    }, [userId])

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
            await reload()
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
            await reload()
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

    /**
     * How long it is valid, or how long it was.
     *
     * Three answers, because there are three situations and one of them is not
     * a duration at all:
     *
     *   still valid  -> what is LEFT. "expires 20/08/2028" is a fact you have
     *                   to do arithmetic on; "another 4 years" is the answer.
     *   revoked      -> from minting to revocation. How long the key was live
     *                   is the question asked after an incident.
     *   expired      -> the lifetime it was given, which is what it ran for.
     *
     * The exact date stays in the column next to this one, so nothing is lost
     * by rounding here.
     */
    function validityOf(entry){
        if(entry.revokedAt){
            return {text: t('token.wasValid', {span: fmtSpan(entry.revokedAt - entry.createdAt)}), past: true}
        }
        if(entry.expiresAt === null || entry.expiresAt === undefined){
            return {text: t('token.unlimited'), past: false}
        }
        const left = entry.expiresAt - Date.now()
        if(left <= 0){
            return {text: t('token.wasValid', {span: fmtSpan(entry.expiresAt - entry.createdAt)}), past: true}
        }
        return {text: t('token.stillValid', {span: fmtSpan(left)}), past: false}
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

            <div className="admin-card">
                <h2 className="admin-section-title">{t('token.listHeading', {n: tokens.length})}</h2>
                {tokens.length === 0
                    ?<p className="admin-muted is-plain">{isLoaded?t('token.none'):t('common.loading')}</p>
                    :<table className="admin-table">
                        <thead>
                            <tr>
                                <th className="admin-th">{t('common.name')}</th>
                                <th className="admin-th">{t('token.account')}</th>
                                <th className="admin-th">{t('token.prefix')}</th>
                                <th className="admin-th">{t('token.lastUsed')}</th>
                                <th className="admin-th">{t('token.validity')}</th>
                                <th className="admin-th">{t('token.expires')}</th>
                                <th className="admin-th">{t('common.state')}</th>
                                <th className="admin-th"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {tokens.map(entry => {
                                const state = stateOf(entry)
                                const validity = validityOf(entry)
                                // The owner is looked up in the list the page
                                // already holds, rather than copied into the
                                // server's answer where it would go stale the
                                // day somebody is renamed.
                                const holder = users.find(u => String(u._id) === String(entry.userId))
                                return (
                                    <tr key={entry.id} className={entry.revokedAt?'is-muted-row':''}>
                                        <td className="admin-td">{entry.name || '—'}</td>
                                        <td className="admin-td">
                                            {holder
                                                ?holder.fullname
                                                :<span className="admin-muted is-plain">{t('token.accountGone')}</span>}
                                        </td>
                                        <td className="admin-td"><code>{entry.prefix}…</code></td>
                                        <td className="admin-td">
                                            {/* "never used" is the answer that says a
                                                deployment did not work. */}
                                            {entry.lastUsedAt
                                                ?utilService.calculateTimeWithBefore(entry.lastUsedAt)
                                                :<span className="admin-muted is-plain">{t('token.neverUsed')}</span>}
                                        </td>
                                        <td className={`admin-td${validity.past?' is-plain-muted':''}`}>
                                            {validity.text}
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
            </div>
        </>
    )
}
