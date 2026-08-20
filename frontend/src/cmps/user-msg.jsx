import {useEffect, useRef, useState} from 'react'
import {subscribeMsgs} from '../services/user-msg.service'
import {t} from '../i18n'
import {Icon} from './icon'

/**
 * The one place messages appear. Belongs in the tree once, outside the routes,
 * next to ConfirmHost — a message that vanishes because the route changed
 * underneath it is worse than no message.
 *
 * Errors stay until they are dismissed. Everything else goes on its own after
 * a few seconds. That asymmetry is deliberate: a confirmation is a courtesy
 * and may be missed, a failure is information the person needs in order to
 * decide what to do, and a failure that disappears while they are still
 * reading it teaches them not to trust the interface.
 *
 * The same text arriving again does not stack up. Fifteen tasks moved into a
 * group the server refuses produce fifteen identical failures, and fifteen
 * identical boxes say nothing that one box and a count does not.
 */

/** How long a non-error stays. */
const DISMISS_AFTER = 5000

/** Never more than this on screen at once. The oldest goes first. */
const MAX_ON_SCREEN = 3

export function UserMsgHost(){
    const [msgs, setMsgs] = useState([])
    // The timers are per message and have to be cleared on unmount — a
    // setState after that is a warning in the console and, in a test, a leak.
    const timers = useRef(new Map())

    useEffect(() => {
        return subscribeMsgs(msg => {
            setMsgs(prev => {
                const last = prev[prev.length - 1]
                if(last && last.txt === msg.txt && last.type === msg.type){
                    const bumped = {...last, count: (last.count || 1) + 1}
                    return [...prev.slice(0, -1), bumped]
                }
                const next = [...prev, {...msg, count: 1}]
                return next.slice(-MAX_ON_SCREEN)
            })
            if(msg.type === 'error') return
            const timer = setTimeout(() => {
                timers.current.delete(msg.id)
                setMsgs(prev => prev.filter(m => m.id !== msg.id))
            }, DISMISS_AFTER)
            timers.current.set(msg.id, timer)
        })
    }, [])

    useEffect(() => {
        const running = timers.current
        return () => {
            for(const timer of running.values()) clearTimeout(timer)
            running.clear()
        }
    }, [])

    function dismiss(id){
        const timer = timers.current.get(id)
        if(timer){
            clearTimeout(timer)
            timers.current.delete(id)
        }
        setMsgs(prev => prev.filter(m => m.id !== id))
    }

    if(!msgs.length) return null

    return (
        <div className="user-msg-stack">
            {msgs.map(msg => (
                <div key={msg.id}
                    className={`user-msg is-${msg.type}`}
                    // Errors interrupt, everything else waits its turn — the
                    // difference between assertive and polite for a screen
                    // reader, and the reason this is not one blanket role.
                    role={msg.type === 'error'?'alert':'status'}
                    aria-live={msg.type === 'error'?'assertive':'polite'}>
                    <Icon name={msg.type === 'error'?'circle-exclamation':'circle-check'} className="user-msg-icon"/>
                    <span className="user-msg-txt">{msg.txt}</span>
                    {msg.count > 1 && <span className="user-msg-count">{`×${msg.count}`}</span>}
                    <button type="button" className="user-msg-close"
                        aria-label={t('common.close')}
                        onClick={() => dismiss(msg.id)}>
                        <Icon name="xmark"/>
                    </button>
                </div>
            ))}
        </div>
    )
}
