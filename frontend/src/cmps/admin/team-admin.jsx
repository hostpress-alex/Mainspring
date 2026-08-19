import {Fragment, useEffect, useState} from 'react'

import {WorkHoursEditor} from '../workhours/work-hours-editor'
import {workHoursOfAll, weekMinutes, toClock, asHours, WEEKDAY_ORDER} from '../../services/workhours.service'
import {calendarLinks, setCalendarLink, removeCalendarLink, syncNow} from '../../services/calendar-sync.service'
import {Icon} from '../icon'
import {getLanguage, t} from '../../i18n'

/**
 * Working hours and calendars, per person.
 *
 * One card rather than two, because the two questions an admin has about a
 * colleague here are next to each other in their head: when do they work, and
 * is their calendar coming through.
 *
 * The Google address is deliberately administrative. It points the server at
 * a mailbox in the company domain, and the server can read that calendar
 * without anybody being asked — so it is not something a person sets for
 * themselves in their profile, where it would look like a preference.
 */
export function TeamAdmin({users, onError}){
    const [hoursByUser, setHoursByUser] = useState({})
    const [links, setLinks] = useState([])
    const [isConfigured, setIsConfigured] = useState(false)
    const [openUserId, setOpenUserId] = useState(null)
    const [drafts, setDrafts] = useState({})
    const [busyId, setBusyId] = useState(null)
    const language = getLanguage()

    const ids = users.map(u => u._id)

    useEffect(() => {
        if(!ids.length) return
        reload()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ids.join(',')])

    async function reload(){
        try {
            const [hours, linkRes] = await Promise.all([workHoursOfAll(ids), calendarLinks()])
            setHoursByUser(hours.byUser || {})
            setLinks(linkRes.links || [])
            setIsConfigured(Boolean(linkRes.isConfigured))
        } catch(e) {
            onError(e)
        }
    }

    const linkOf = userId => links.find(l => l.userId === userId) || null

    async function run(userId, fn){
        setBusyId(userId)
        try {
            await fn()
            await reload()
        } catch(e) {
            onError(e)
        } finally {
            setBusyId(null)
        }
    }

    function onSaveLink(user){
        const email = (drafts[user._id] ?? (linkOf(user._id)?.externalEmail || '')).trim()
        if(!email) return run(user._id, () => removeCalendarLink(user._id))
        run(user._id, async () => {
            await setCalendarLink(user._id, {externalEmail: email})
            // Straight away rather than in a quarter of an hour: the address
            // was just typed and whether it works is the next question.
            await syncNow(user._id)
        })
    }

    return (
        <div className="admin-card">
            <h2 className="admin-section-title">{t('workhours.sectionTitle')}</h2>
            <p className="admin-sub">{t('workhours.sectionHelp')}</p>

            {!isConfigured && (
                <p className="admin-sub is-footnote">{t('calendar.notConfigured')}</p>
            )}

            <table className="admin-table team-table">
                <thead>
                    <tr>
                        <th className="admin-th">{t('common.name')}</th>
                        <th className="admin-th">{t('workhours.week')}</th>
                        <th className="admin-th">{t('calendar.googleAddress')}</th>
                        <th className="admin-th">{t('calendar.lastSync')}</th>
                        <th className="admin-th"></th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(user => {
                        const days = hoursByUser[user._id] || []
                        const link = linkOf(user._id)
                        const isOpen = openUserId === user._id
                        const isBusy = busyId === user._id
                        return (
                            <Fragment key={user._id}>
                                <tr>
                                    <td className="admin-td">{user.fullname}</td>
                                    <td className="admin-td team-hours">
                                        {days.length?(
                                            <>
                                                <span className="team-hours-days">{summarise(days)}</span>
                                                <span className="team-hours-total">
                                                    {t('workhours.hours', {n: asHours(weekMinutes(days), language)})}
                                                </span>
                                            </>
                                        ):(
                                            <span className="work-hours-free">{t('workhours.none')}</span>
                                        )}
                                    </td>
                                    <td className="admin-td">
                                        <input className="admin-input team-email" type="email"
                                            placeholder={isConfigured?t('calendar.googlePlaceholder'):t('calendar.notConfiguredShort')}
                                            disabled={!isConfigured || isBusy}
                                            value={drafts[user._id] ?? (link?link.externalEmail:'')}
                                            onChange={ev => setDrafts({...drafts, [user._id]: ev.target.value})}
                                            onBlur={() => onSaveLink(user)}
                                            onKeyDown={ev => {
                                                if(ev.key === 'Enter') ev.currentTarget.blur()
                                            }}/>
                                    </td>
                                    <td className="admin-td team-sync">
                                        {link?(
                                            link.lastError
                                                ?<span className="team-sync-error" title={link.lastError}>
                                                    <Icon name="triangle-exclamation"/> {t('calendar.syncFailed')}
                                                </span>
                                                :<span>{link.lastSyncAt?new Date(link.lastSyncAt).toLocaleString(language):t('calendar.never')}</span>
                                        ):(
                                            <span className="work-hours-free">—</span>
                                        )}
                                    </td>
                                    <td className="admin-td team-tools">
                                        <button type="button" className="admin-btn-ghost"
                                            onClick={() => setOpenUserId(isOpen?null:user._id)}>
                                            {isOpen?t('common.close'):t('workhours.edit')}
                                        </button>
                                        <button type="button" className="admin-btn-ghost" disabled={!link || isBusy}
                                            title={t('calendar.syncNow')}
                                            onClick={() => run(user._id, () => syncNow(user._id))}>
                                            <Icon name="rotate"/>
                                        </button>
                                    </td>
                                </tr>
                                {isOpen && (
                                    <tr className="team-editor-row">
                                        <td className="admin-td" colSpan={5}>
                                            <WorkHoursEditor userId={user._id} onSaved={reload}/>
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )

    /** "Mo–Fr 09:00–17:00", or the days spelled out when they differ. */
    function summarise(days){
        const byWeekday = new Map(days.map(d => [d.weekday, d]))
        const on = WEEKDAY_ORDER.filter(w => byWeekday.has(w))
        if(!on.length) return ''
        const first = byWeekday.get(on[0])
        const same = on.every(w => {
            const d = byWeekday.get(w)
            return d.startMin === first.startMin && d.endMin === first.endMin
        })
        const names = on.map(w => t(`workhours.weekdayShort.${w}`))
        const label = same && on.length > 1?`${names[0]}–${names[names.length - 1]}`:names.join(', ')
        return same?`${label} ${toClock(first.startMin)}–${toClock(first.endMin)}`:label
    }
}
