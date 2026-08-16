import {useEffect, useRef, useState, useCallback} from 'react'
import {useNavigate} from 'react-router-dom'
import {Tooltip} from '@mui/material'

import {Icon} from '../icon'
import {Avatar} from '../avatar'
import {notificationService} from '../../services/notification.service'
import {socketService} from '../../services/socket.service'
import {fmtRelative} from '../../services/date.util'
import {t} from '../../i18n'
import './notification.css'

/**
 * The bell and its panel.
 *
 * Two things are worth knowing about the behaviour:
 *
 * Opening the panel does not mark anything read. Monday does the same, and the
 * reason is that a glance at the list is not the same as having taken it in —
 * marking on open means the one entry that mattered is silently cleared along
 * with nine that did not. Reading happens on click, or explicitly.
 *
 * The badge is kept up to date by the socket, not by polling. A fetch on an
 * interval would be simpler, but it also means the number is wrong for
 * however long the interval is, which is exactly the moment somebody is
 * waiting to be told something.
 */

/** How the list is cut into the sections the panel shows. */
const SECTIONS = [
    {key: 'today', within: 1},
    {key: 'week', within: 7},
    {key: 'older', within: Infinity}
]

function sectionOf(createdAt, now){
    const days = (now - createdAt) / 86400000
    return (SECTIONS.find(s => days < s.within) || SECTIONS[SECTIONS.length - 1]).key
}

/** The sentence shown for one entry. Every kind has its own key. */
function describe(item){
    const actor = item.actor && item.actor.fullname?item.actor.fullname:t('notification.someone')
    switch(item.kind){
        case 'assigned': return t('notification.assigned', {actor})
        case 'invited': return t('notification.invited', {actor})
        case 'mention': return t('notification.mention', {actor})
        case 'comment': return t('notification.comment', {actor})
        case 'value': return t('notification.value', {actor, column: item.detail.column || ''})
        default: return t('notification.generic', {actor})
    }
}

export function NotificationBell(){
    const [isOpen, setIsOpen] = useState(false)
    const [items, setItems] = useState([])
    const [unread, setUnread] = useState(0)
    const [isLoading, setIsLoading] = useState(false)
    const [onlyUnread, setOnlyUnread] = useState(false)
    const panelRef = useRef(null)
    const navigate = useNavigate()

    const load = useCallback(async () => {
        setIsLoading(true)
        try {
            const {items: fetched, unread: count} = await notificationService.query()
            setItems(fetched)
            setUnread(count)
        } catch(err){
            console.error('cannot load notifications', err)
        } finally {
            setIsLoading(false)
        }
    }, [])

    // The badge has to be right before the panel is ever opened, so the count
    // is fetched once on mount rather than on first open.
    useEffect(() => {
        notificationService.unreadCount()
            .then(({unread: count}) => setUnread(count))
            .catch(() => {})
    }, [])

    // Live arrivals. The list is only touched while it is on screen — no point
    // growing an array nobody is looking at.
    useEffect(() => {
        function onAdded(item){
            setUnread(n => n + 1)
            setItems(prev => (prev.length?[item, ...prev]:prev))
        }
        socketService.on('notification-added', onAdded)
        return () => socketService.off('notification-added', onAdded)
    }, [])

    // Close on a click outside or on Escape.
    useEffect(() => {
        if(!isOpen) return
        function onDocClick(ev){
            if(panelRef.current && !panelRef.current.contains(ev.target)) setIsOpen(false)
        }
        function onKey(ev){
            if(ev.key === 'Escape') setIsOpen(false)
        }
        document.addEventListener('mousedown', onDocClick)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onDocClick)
            document.removeEventListener('keydown', onKey)
        }
    }, [isOpen])

    function onToggle(){
        const next = !isOpen
        setIsOpen(next)
        if(next) load()
    }

    async function onOpenItem(item){
        setIsOpen(false)
        if(!item.readAt){
            setItems(prev => prev.map(i => (i.id === item.id?{...i, readAt: Date.now()}:i)))
            setUnread(n => Math.max(0, n - 1))
            notificationService.markRead([item.id]).catch(() => {})
        }
        navigate(item.taskId?`/board/${item.boardId}`:`/board/${item.boardId}`)
    }

    async function onMarkAll(){
        setItems(prev => prev.map(i => (i.readAt?i:{...i, readAt: Date.now()})))
        setUnread(0)
        notificationService.markAllRead().catch(() => {})
    }

    const now = Date.now()
    const shown = onlyUnread?items.filter(i => !i.readAt):items
    const sections = SECTIONS
        .map(s => ({key: s.key, entries: shown.filter(i => sectionOf(i.createdAt, now) === s.key)}))
        .filter(s => s.entries.length)

    return (
        <div className="notification-bell" ref={panelRef}>
            <Tooltip title={t('notification.title')} arrow placement="right">
                <div className={`icon-container${isOpen?' is-active':''}`} onClick={onToggle}>
                    <Icon name="bell"/>
                    {unread > 0 && (
                        <span className="notification-badge" aria-label={t('notification.unreadCount', {n: unread})}>
                            {unread > 99?'99+':unread}
                        </span>
                    )}
                </div>
            </Tooltip>

            {isOpen && (
                <section className="notification-panel" role="dialog" aria-label={t('notification.title')}>
                    <header className="notification-panel-head">
                        <h2>{t('notification.title')}</h2>
                        <div className="notification-panel-tools">
                            <label className="notification-filter">
                                <input type="checkbox" checked={onlyUnread} onChange={ev => setOnlyUnread(ev.target.checked)}/>
                                {t('notification.onlyUnread')}
                            </label>
                            <button type="button" className="notification-mark-all" onClick={onMarkAll} disabled={!unread}>
                                {t('notification.markAllRead')}
                            </button>
                        </div>
                    </header>

                    <div className="notification-list">
                        {isLoading && <p className="notification-empty">{t('common.loading')}</p>}
                        {!isLoading && !sections.length && (
                            <p className="notification-empty">
                                {onlyUnread?t('notification.emptyUnread'):t('notification.empty')}
                            </p>
                        )}

                        {sections.map(section => (
                            <div key={section.key} className="notification-section">
                                <h3>{t(`notification.section.${section.key}`)}</h3>
                                {section.entries.map(item => (
                                    <button
                                        type="button"
                                        key={item.id}
                                        className={`notification-item${item.readAt?'':' is-unread'}`}
                                        onClick={() => onOpenItem(item)}
                                    >
                                        <Avatar className="notification-avatar" src={item.actor && item.actor.imgUrl}/>
                                        <span className="notification-body">
                                            <span className="notification-text">{describe(item)}</span>
                                            <span className="notification-subject">{item.subject}</span>
                                            {(item.kind === 'comment' || item.kind === 'mention') && item.detail.text && (
                                                <span className="notification-detail">{item.detail.text}</span>
                                            )}
                                            {item.kind === 'value' && (
                                                <span className="notification-detail">
                                                    {String(item.detail.from ?? '—')} → {String(item.detail.to ?? '—')}
                                                </span>
                                            )}
                                            <span className="notification-board">{item.boardTitle}</span>
                                        </span>
                                        <span className="notification-when">{fmtRelative(item.createdAt)}</span>
                                        {!item.readAt && <span className="notification-dot" aria-hidden="true"/>}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}
