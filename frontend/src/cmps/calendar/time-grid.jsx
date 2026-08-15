import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
    addDays, isToday, isSameDay, layoutDay, minutesOfDay, snapMinutes,
    startOfDay, fmtTime, fmtDuration, pad, WEEKDAYS_SHORT, MS_MIN,
} from '../../services/date.util'

const SNAP = 15                 // Minuten-Raster fuer Ziehen und Anlegen
const MIN_DRAG_MINUTES = 15     // darunter gilt es als Klick, nicht als Ziehen
const DEFAULT_MINUTES = 60      // Dauer beim einfachen Klick ins Raster
const GUTTER_PX = 58           // Breite der Stundenleiste, siehe calendar.css

/**
 * Tages- und Wochenansicht.
 *
 * Interaktion:
 *  - Ziehen im leeren Raster legt einen neuen Eintrag an
 *  - Klick ins leere Raster legt einen Eintrag ueber DEFAULT_MINUTES an
 *  - Ziehen eines Eintrags verschiebt ihn (auch auf einen anderen Tag)
 *  - Ziehen am unteren Rand aendert die Dauer
 *  - Klick ohne Bewegung oeffnet den Bearbeiten-Dialog
 */
export function TimeGrid ({ days, entries, onCreate, onMove, onOpen }) {
    const elGrid = useRef()
    const elBody = useRef()
    const [drag, setDrag] = useState(null)
    const [nowMin, setNowMin] = useState(minutesOfDay(new Date()))

    // Rote Jetzt-Linie aktuell halten
    useEffect(() => {
        const id = setInterval(() => setNowMin(minutesOfDay(new Date())), 60 * 1000)
        return () => clearInterval(id)
    }, [])

    // Beim Oeffnen in den Arbeitstag scrollen statt auf Mitternacht zu starten
    useLayoutEffect(() => {
        const body = elBody.current
        if (!body) return
        body.scrollTop = (7 / 24) * (body.scrollHeight - body.clientHeight) * 1.15
    }, [days.length])

    /**
     * Messgrundlage ist das Rasterelement. Die Spalten selbst liegen in einem
     * display:contents-Wrapper und haetten keine eigene Box.
     */
    function gridBox () {
        const box = elGrid.current.getBoundingClientRect()
        return { top: box.top, height: box.height, left: box.left + GUTTER_PX, width: box.width - GUTTER_PX }
    }

    /** Pixelposition -> Minuten seit Mitternacht, auf SNAP gerundet. */
    function minutesFromEvent (ev) {
        const box = gridBox()
        return snapMinutes(((ev.clientY - box.top) / box.height) * 1440, SNAP)
    }

    /** Pixelposition -> Spaltenindex (fuer das Verschieben zwischen Tagen). */
    function dayIndexFromEvent (ev) {
        const box = gridBox()
        const idx = Math.floor(((ev.clientX - box.left) / box.width) * days.length)
        return Math.max(0, Math.min(days.length - 1, idx))
    }

    function onGridMouseDown (ev, dayIdx) {
        if (ev.button !== 0) return
        const min = minutesFromEvent(ev)
        setDrag({ mode: 'create', dayIdx, anchorMin: min, fromMin: min, toMin: min, moved: false })
    }

    function onEventMouseDown (ev, item, mode) {
        if (ev.button !== 0) return
        ev.stopPropagation()
        const entryStart = new Date(item.entry.start)
        const entryEnd = new Date(item.entry.end)
        setDrag({
            mode,
            entry: item.entry,
            grabMin: minutesFromEvent(ev),
            origStart: entryStart,
            origEnd: entryEnd,
            durationMin: (entryEnd - entryStart) / MS_MIN,
            dayIdx: days.findIndex(d => isSameDay(d, entryStart)),
            deltaMin: 0,
            moved: false,
        })
    }

    useEffect(() => {
        if (!drag) return

        function onMove_ (ev) {
            const min = minutesFromEvent(ev)
            setDrag(d => {
                if (!d) return d
                if (d.mode === 'create') {
                    const moved = d.moved || Math.abs(min - d.anchorMin) >= MIN_DRAG_MINUTES
                    return { ...d, fromMin: Math.min(d.anchorMin, min), toMin: Math.max(d.anchorMin, min), moved }
                }
                if (d.mode === 'move') {
                    const dayIdx = dayIndexFromEvent(ev)
                    const deltaMin = min - d.grabMin
                    const moved = d.moved || Math.abs(deltaMin) >= SNAP || dayIdx !== d.dayIdx
                    return { ...d, deltaMin, targetDayIdx: dayIdx, moved }
                }
                // resize
                const endMin = Math.max(min, minutesOfDay(d.origStart) + MIN_DRAG_MINUTES)
                return { ...d, endMin, moved: d.moved || endMin !== minutesOfDay(d.origEnd) }
            })
        }

        function onUp () {
            setDrag(d => {
                if (!d) return null
                finishDrag(d)
                return null
            })
        }

        window.addEventListener('mousemove', onMove_)
        window.addEventListener('mouseup', onUp)
        return () => {
            window.removeEventListener('mousemove', onMove_)
            window.removeEventListener('mouseup', onUp)
        }
    }, [drag, days])

    function finishDrag (d) {
        if (d.mode === 'create') {
            const base = startOfDay(days[d.dayIdx])
            const fromMin = d.moved ? d.fromMin : d.anchorMin
            const toMin = d.moved ? d.toMin : Math.min(d.anchorMin + DEFAULT_MINUTES, 1440)
            if (toMin - fromMin < 5) return
            onCreate({
                start: new Date(base.getTime() + fromMin * MS_MIN),
                end: new Date(base.getTime() + toMin * MS_MIN),
            })
            return
        }

        if (!d.moved) { onOpen(d.entry); return }

        if (d.mode === 'move') {
            const targetDay = days[d.targetDayIdx ?? d.dayIdx]
            const newStartMin = snapMinutes(minutesOfDay(d.origStart) + d.deltaMin, SNAP)
            const base = startOfDay(targetDay)
            const start = new Date(base.getTime() + newStartMin * MS_MIN)
            const end = new Date(start.getTime() + d.durationMin * MS_MIN)
            onMove(d.entry, { start, end })
            return
        }

        const base = startOfDay(d.origStart)
        const end = new Date(base.getTime() + d.endMin * MS_MIN)
        if (end - d.origStart < 5 * MS_MIN) return
        onMove(d.entry, { start: d.origStart, end })
    }

    /** Vorschau waehrend des Ziehens statt der gespeicherten Zeiten. */
    function previewFor (entry) {
        if (!drag || !drag.entry || drag.entry._id !== entry._id || !drag.moved) return null
        if (drag.mode === 'move') {
            const targetDay = days[drag.targetDayIdx ?? drag.dayIdx]
            const base = startOfDay(targetDay)
            const startMin = snapMinutes(minutesOfDay(drag.origStart) + drag.deltaMin, SNAP)
            const start = new Date(base.getTime() + startMin * MS_MIN)
            return { ...entry, start, end: new Date(start.getTime() + drag.durationMin * MS_MIN) }
        }
        const base = startOfDay(drag.origStart)
        return { ...entry, start: drag.origStart, end: new Date(base.getTime() + drag.endMin * MS_MIN) }
    }

    const shown = entries.map(e => previewFor(e) || e)

    return (
        <div className='cal-body' ref={elBody}>
            <div className='cal-head' style={{ '--cal-cols': days.length }}>
                <div className='cal-head-gutter' />
                {days.map(day => {
                    const weekend = [0, 6].includes(day.getDay())
                    return (
                        <div key={+day}
                            className={`cal-head-day${isToday(day) ? ' is-today' : ''}${weekend ? ' is-weekend' : ''}`}>
                            <div className='cal-head-name'>{WEEKDAYS_SHORT[(day.getDay() + 6) % 7]}</div>
                            <div className='cal-head-num'>{day.getDate()}</div>
                        </div>
                    )
                })}
            </div>

            <div className='cal-grid' ref={elGrid} style={{ '--cal-cols': days.length }}>
                <div className='cal-gutter'>
                    {Array.from({ length: 24 }, (_, h) => (
                        <div className='cal-gutter-hour' key={h}>
                            <span>{h ? `${pad(h)}:00` : ''}</span>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'contents' }}>
                    {days.map((day, dayIdx) => {
                        const items = layoutDay(shown, day)
                        const weekend = [0, 6].includes(day.getDay())
                        const today = isToday(day)
                        const isDraftHere = drag?.mode === 'create' && drag.dayIdx === dayIdx
                        const draftFrom = isDraftHere ? (drag.moved ? drag.fromMin : drag.anchorMin) : 0
                        const draftTo = isDraftHere
                            ? (drag.moved ? drag.toMin : Math.min(drag.anchorMin + DEFAULT_MINUTES, 1440))
                            : 0

                        return (
                            <div key={+day}
                                className={`cal-col${weekend ? ' is-weekend' : ''}${today ? ' is-today' : ''}`}
                                onMouseDown={ev => onGridMouseDown(ev, dayIdx)}>
                                {Array.from({ length: 48 }, (_, i) => (
                                    <div key={i} className={`cal-hourline${i % 2 === 1 ? ' is-hour' : ''}`} />
                                ))}

                                {today && (
                                    <div className='cal-now' style={{ top: `${(nowMin / 1440) * 100}%` }} />
                                )}

                                {isDraftHere && draftTo > draftFrom && (
                                    <div className='cal-draft' style={{
                                        top: `${(draftFrom / 1440) * 100}%`,
                                        height: `${((draftTo - draftFrom) / 1440) * 100}%`,
                                    }}>
                                        {fmtTime(new Date(startOfDay(day).getTime() + draftFrom * MS_MIN))} –{' '}
                                        {fmtTime(new Date(startOfDay(day).getTime() + draftTo * MS_MIN))}
                                    </div>
                                )}

                                {items.map(item => {
                                    const isDragging = drag?.entry?._id === item.entry._id && drag.moved
                                    const width = 100 / item.cols
                                    const short = item.heightPct < 3.2
                                    return (
                                        <div key={item.entry._id}
                                            className={`cal-event${isDragging ? ' is-dragging' : ''}` +
                                                `${item.continuesBefore ? ' is-continues-before' : ''}` +
                                                `${item.continuesAfter ? ' is-continues-after' : ''}`}
                                            title={`${item.entry.taskTitle}\n${fmtTime(item.start)}–${fmtTime(item.end)}\n${item.entry.boardTitle} · ${item.entry.groupTitle}`}
                                            style={{
                                                background: item.entry.color || '#0073ea',
                                                top: `${item.topPct}%`,
                                                height: `calc(${item.heightPct}% - 2px)`,
                                                left: `calc(${item.col * width}% + 2px)`,
                                                width: `calc(${width}% - 4px)`,
                                            }}
                                            onMouseDown={ev => onEventMouseDown(ev, item, 'move')}>
                                            {short ? (
                                                <div className='cal-event-short'>
                                                    <span className='cal-event-title'>{item.entry.taskTitle}</span>
                                                    <span className='cal-event-sub'>{fmtTime(item.start)}</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className='cal-event-title'>{item.entry.taskTitle}</div>
                                                    <div className='cal-event-sub'>
                                                        {fmtTime(item.start)}–{fmtTime(item.end)} · {fmtDuration(item.end - item.start)}
                                                    </div>
                                                    {item.heightPct > 8 && (
                                                        <div className='cal-event-sub'>{item.entry.boardTitle}</div>
                                                    )}
                                                </>
                                            )}
                                            <div className='cal-event-handle'
                                                onMouseDown={ev => onEventMouseDown(ev, item, 'resize')} />
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
