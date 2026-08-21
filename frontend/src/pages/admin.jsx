import {useCallback, useEffect, useState} from 'react'
import {useSelector} from 'react-redux'
import {useSearchParams} from 'react-router-dom'

import {userService} from '../services/user.service'
import {boardService} from '../services/board.service'
import {PriorityAdmin} from '../cmps/admin/priority-admin'
import {TeamAdmin} from '../cmps/admin/team-admin'
import {UserAdmin} from '../cmps/admin/user-admin'
import {BoardAdmin} from '../cmps/admin/board-admin'
import {TokenAdmin} from '../cmps/admin/token-admin'
import {ADMIN_TABS, resolveAdminTab} from '../cmps/admin/admin-tabs'
import {Icon} from '../cmps/icon'
import {t} from '../i18n'

/**
 * The administration, in sections.
 *
 * It used to be one column: priorities, then working hours, then the user
 * form, then the user list, then boards and access — five cards deep, and
 * finding the one you wanted meant scrolling past the four you did not. The
 * sections had nothing to do with each other, which is exactly the case for
 * tabs rather than headings.
 *
 * **The open tab lives in the address.** Same reason the task panel does (see
 * board-modal): a reload keeps you where you were, a link can point at a
 * section, and the browser's back button does what it looks like it does.
 * Local state would have lost the tab on every reload — and this is a page
 * people reload, because they come back to it after changing something
 * elsewhere.
 *
 * The page owns the two lists and nothing else. Users are needed by three of
 * the four tabs, so loading them here is one request instead of three; every
 * panel does its own writing and says when something changed.
 */
export function AdminPage(){
    const me = useSelector(storeState => storeState.userModule.user)
    const [searchParams, setSearchParams] = useSearchParams()
    const [users, setUsers] = useState([])
    const [boards, setBoards] = useState([])
    const [msg, setMsg] = useState(null)
    const [err, setErr] = useState(null)

    const tab = resolveAdminTab(searchParams.get('tab'))

    const reload = useCallback(async () => {
        try {
            // With the closed accounts: this is the one page that has to be
            // able to open one again.
            const [u, b] = await Promise.all([
                userService.getUsers({withInactive: true}), boardService.query()])
            setUsers(u)
            setBoards(b)
        } catch(e) {
            setErr(readErr(e))
        }
    }, [])

    useEffect(() => {
        reload()
    }, [reload])

    function readErr(e){
        if(!e) return null
        return e?.response?.data?.err || e?.message || t('common.unknownError')
    }

    /** A panel reports a failure; null clears the line. */
    function onError(e){
        setErr(readErr(e))
    }

    function flash(text){
        setMsg(text)
        setErr(null)
        setTimeout(() => setMsg(null), 3000)
    }

    function openTab(key){
        // `replace` on purpose: clicking through four tabs should not leave
        // four entries in the history for the back button to walk out of.
        const next = new URLSearchParams(searchParams)
        next.set('tab', key)
        setSearchParams(next, {replace: true})
    }

    return (
        <section className="admin-page">
            <h1 className="admin-title">{t('nav.administration')}</h1>
            <p className="admin-sub">{t('admin.signedInAs', {name: me?.fullname})}</p>

            {/* Above the panels, so a message is read whichever tab is open. */}
            {err && <div className="admin-error">{err}</div>}
            {msg && <div className="admin-success">{msg}</div>}

            <div className="admin-tabs" role="tablist">
                {ADMIN_TABS.map(entry => (
                    <div key={entry.key} className={`admin-tab${tab === entry.key?' is-active':''}`}>
                        <button type="button" className="admin-tab-open" role="tab"
                            aria-selected={tab === entry.key}
                            onClick={() => openTab(entry.key)}>
                            <Icon name={entry.icon} className="icon"/>
                            <span className="admin-tab-name">{t(entry.labelKey)}</span>
                        </button>
                    </div>
                ))}
            </div>

            {/* Only the open one is mounted. Each panel loads what only it
                needs when it appears, instead of the page fetching everything
                for four sections of which three are not on screen. */}
            {tab === 'general' && <PriorityAdmin onError={onError}/>}
            {tab === 'team' && <TeamAdmin users={users} onError={onError}/>}
            {tab === 'users' &&
                <UserAdmin users={users} onChanged={reload} onError={onError} onFlash={flash}/>}
            {tab === 'boards' &&
                <BoardAdmin users={users} boards={boards} onChanged={reload} onError={onError} onFlash={flash}/>}
            {tab === 'tokens' && <TokenAdmin users={users} onError={onError} onFlash={flash}/>}
        </section>
    )
}
