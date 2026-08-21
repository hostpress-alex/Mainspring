import {useCallback, useEffect, useState} from 'react'

import {Icon} from './icon'
import {userService} from '../services/user.service'
import {utilService} from '../services/util.service'
import {t} from '../i18n'
import {localErrorText} from '../services/error-text'

/**
 * Where this account is signed in.
 *
 * Only possible since sessions became rows: while the cookie was the session,
 * there was nothing to list. The token is not in the answer and cannot be —
 * the table holds its hash, not the value.
 *
 * The current browser is marked by the server rather than worked out here. The
 * client cannot know which row is its own: it never sees its own session id,
 * which is the point of the whole arrangement.
 */
export function SessionList({userId, onCurrentEnded}){
    const [rows, setRows] = useState([])
    const [err, setErr] = useState(null)
    const [isLoading, setIsLoading] = useState(true)

    const load = useCallback(async () => {
        try {
            setRows(await userService.getSessions(userId))
        } catch(e) {
            setErr(localErrorText(e))
        } finally {
            setIsLoading(false)
        }
    }, [userId])

    useEffect(() => {
        load()
    }, [load])

    async function onEnd(row){
        setErr(null)
        try {
            await userService.endSession(userId, row.id)
            if(row.isCurrent) return onCurrentEnded()
            await load()
        } catch(e) {
            setErr(localErrorText(e))
        }
    }

    if(isLoading) return <p className="profile-hint">{t('common.loading')}</p>

    return (
        <div className="session-list">
            {err && <div className="profile-error">{err}</div>}
            {rows.map(row => (
                <div key={row.id} className={`session-row${row.isCurrent?' is-current':''}`}>
                    <Icon name='display' className="session-icon"/>
                    <span className="session-agent" title={row.userAgent}>
                        {describeAgent(row.userAgent)}
                        {row.isCurrent && <span className="session-badge">{t('profile.thisDevice')}</span>}
                    </span>
                    <span className="session-seen">
                        {t('profile.lastSeen')} {utilService.calculateTime(row.lastSeenAt)}
                    </span>
                    <button type="button" className="profile-btn-ghost" onClick={() => onEnd(row)}>
                        {t('profile.endSession')}
                    </button>
                </div>
            ))}
            {!rows.length && <p className="profile-hint">{t('profile.noSessions')}</p>}
        </div>
    )
}

/**
 * A user agent string, shortened to something a person recognises.
 *
 * Deliberately crude and deliberately not a library: this only has to help
 * somebody tell their own three browsers apart, and the full string is in the
 * tooltip for the case where it does not.
 */
function describeAgent(agent = ''){
    const ua = String(agent)
    if(!ua) return t('profile.unknownDevice')

    const browser = /Edg\//.test(ua)?'Edge'
        :/OPR\//.test(ua)?'Opera'
            :/Chrome\//.test(ua)?'Chrome'
                :/Safari\//.test(ua) && /Version\//.test(ua)?'Safari'
                    :/Firefox\//.test(ua)?'Firefox':null

    const system = /Windows/.test(ua)?'Windows'
        :/Android/.test(ua)?'Android'
            :/iPhone|iPad/.test(ua)?'iOS'
                :/Mac OS X/.test(ua)?'macOS'
                    :/Linux/.test(ua)?'Linux':null

    if(browser && system) return `${browser} · ${system}`
    return browser || system || ua.slice(0, 40)
}
