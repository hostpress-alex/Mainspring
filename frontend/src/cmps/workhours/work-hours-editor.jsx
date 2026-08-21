import {useEffect, useState} from 'react'

import {
    WEEKDAY_ORDER, DEFAULT_WEEK, workHoursOf, saveWorkHours,
    toClock, fromClock, minutesOfDay, weekMinutes, asHours
} from '../../services/workhours.service'
import {getLanguage, t} from '../../i18n'
import {localErrorText} from '../../services/error-text'

/**
 * One person's week.
 *
 * Used twice with the same code: by somebody editing their own hours in the
 * profile, and by an admin editing anybody's. The only difference is whose
 * id is passed in — which is also exactly the difference the server enforces,
 * so the two cannot drift apart.
 *
 * A day is either on or off. There is no "half day" and no second interval
 * for an afternoon: a break is a number of minutes, and where it sits does
 * not change a single number this feature produces. Adding the shape without
 * a use for it is how a settings screen becomes a form nobody fills in.
 */
export function WorkHoursEditor({userId, canEdit = true, onSaved}){
    const [days, setDays] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [err, setErr] = useState(null)
    const [msg, setMsg] = useState(null)
    const language = getLanguage()

    useEffect(() => {
        let alive = true
        setIsLoading(true)
        workHoursOf(userId)
            .then(res => { if(alive) setDays(res.days || []) })
            .catch(e => { if(alive) setErr(readErr(e)) })
            .finally(() => { if(alive) setIsLoading(false) })
        return () => { alive = false }
    }, [userId])

    const byWeekday = new Map(days.map(d => [d.weekday, d]))

    function setDay(weekday, patch){
        setMsg(null)
        setDays(prev => {
            const next = prev.filter(d => d.weekday !== weekday)
            const current = prev.find(d => d.weekday === weekday) || {weekday, startMin: 9 * 60, endMin: 17 * 60, breakMin: 0}
            next.push({...current, ...patch})
            return next.sort((a, b) => a.weekday - b.weekday)
        })
    }

    function toggleDay(weekday, isOn){
        setMsg(null)
        if(!isOn) return setDays(prev => prev.filter(d => d.weekday !== weekday))
        setDay(weekday, {})
    }

    async function onSave(){
        setErr(null)
        setMsg(null)
        setIsSaving(true)
        try {
            const res = await saveWorkHours(userId, days)
            setDays(res.days || [])
            setMsg(t('workhours.saved'))
            if(onSaved) onSaved(res.days || [])
        } catch(e) {
            setErr(readErr(e))
        } finally {
            setIsSaving(false)
        }
    }

    if(isLoading) return <p className="admin-sub">{t('common.loading')}</p>

    const total = weekMinutes(days)

    return (
        <div className="work-hours">
            {err && <div className="admin-error">{err}</div>}

            <table className="work-hours-table">
                <tbody>
                    {WEEKDAY_ORDER.map(weekday => {
                        const day = byWeekday.get(weekday)
                        const isOn = Boolean(day)
                        return (
                            <tr key={weekday} className={isOn?'':'is-off'}>
                                <td className="work-hours-day">
                                    <label>
                                        <input type="checkbox" checked={isOn} disabled={!canEdit}
                                            onChange={ev => toggleDay(weekday, ev.target.checked)}/>
                                        <span>{t(`workhours.weekday.${weekday}`)}</span>
                                    </label>
                                </td>
                                <td className="work-hours-times">
                                    {isOn?(
                                        <>
                                            {/* type=time rather than a text field: the browser
                                                brings the keyboard, the clock format of the
                                                system and the arrow keys with it. */}
                                            <input type="time" className="admin-input" value={toClock(day.startMin)}
                                                disabled={!canEdit} step="300"
                                                onChange={ev => {
                                                    const min = fromClock(ev.target.value)
                                                    if(min !== null) setDay(weekday, {startMin: min})
                                                }}/>
                                            <span className="work-hours-dash">–</span>
                                            <input type="time" className="admin-input" value={toClock(day.endMin)}
                                                disabled={!canEdit} step="300"
                                                onChange={ev => {
                                                    const min = fromClock(ev.target.value)
                                                    if(min !== null) setDay(weekday, {endMin: min})
                                                }}/>
                                            <label className="work-hours-break">
                                                <span>{t('workhours.break')}</span>
                                                <input type="number" className="admin-input" min="0" max="480" step="5"
                                                    disabled={!canEdit} value={day.breakMin || 0}
                                                    onChange={ev => setDay(weekday, {breakMin: Math.max(0, Number(ev.target.value) || 0)})}/>
                                            </label>
                                        </>
                                    ):(
                                        <span className="work-hours-free">{t('workhours.free')}</span>
                                    )}
                                </td>
                                <td className="work-hours-sum">
                                    {isOn?t('workhours.hours', {n: asHours(minutesOfDay(day), language)}):''}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>

            <div className="work-hours-foot">
                <span className="work-hours-total">
                    {t('workhours.weekTotal', {n: asHours(total, language)})}
                </span>
                {canEdit && (
                    <div className="work-hours-tools">
                        <button type="button" className="admin-btn-ghost" disabled={isSaving}
                            onClick={() => {
                                setMsg(null)
                                setDays(DEFAULT_WEEK.map(d => ({...d})))
                            }}>
                            {t('workhours.preset')}
                        </button>
                        <button type="button" className="admin-btn" disabled={isSaving} onClick={onSave}>
                            {t('common.save')}
                        </button>
                    </div>
                )}
                {msg && <span className="work-hours-saved">{msg}</span>}
            </div>
        </div>
    )
}

function readErr(e){
    return localErrorText(e)
}
