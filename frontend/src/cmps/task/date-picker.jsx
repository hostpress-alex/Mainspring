import DatePicker from 'react-datepicker'

import 'react-datepicker/dist/react-datepicker.css'
import {boardService} from '../../services/board.service'
import {Icon} from '../icon'
import {dueFill, dueLabel, dueTone} from '../../services/due-date'

export function DueDate({info, onUpdate, field = 'dueDate', readOnly = false}){

    const activity = boardService.getEmptyActivity()
    activity.action = 'date'
    activity.from = info[field]
    activity.task = {id: info.id, title: info.title}

    function onChange(data){
        activity.to = data.getTime()
        onUpdate(field, data.getTime(), activity)
    }

    // "87 Tage überfällig" on hover, and a colour for the three cases worth
    // noticing. Counted in calendar days — see services/due-date.js for why
    // that is not the same as dividing by 24 hours.
    const label = dueLabel(info[field])
    const tone = dueTone(info[field])
    const cellClass = `picker date-picker${tone?' is-' + tone:''}`
    const mark = <DueMark value={info[field]}/>

    // Not the datepicker with `disabled`: that greys the date out, and the
    // date is exactly what a viewer came to read. The same text without the
    // machinery behind it.
    if(readOnly){
        return (
            <section className={`${cellClass} is-readonly`} title={label || undefined}>
                {mark}
                <span className="date-readonly">{formatDate(info[field])}</span>
            </section>
        )
    }

    return (
        <section className={cellClass} title={label || undefined}>
            {mark}
            <DatePicker popperClassName="date-picker-input" dateFormat="MMM d" selected={info[field] || null} onChange={onChange}/>
        </section>
    )
}
/**
 * The symbol in front of the date.
 *
 * Past: an exclamation mark, because "how overdue" is not something a shape
 * can say and the number is in the tooltip anyway. Ahead: a circle that fills
 * as the day approaches — see dueFill.
 *
 * The circle is a conic gradient rather than an SVG arc. It is one line of
 * CSS against a path with two trigonometric functions in it, it scales with
 * the font, and it takes its colour from `currentColor` — so the three tones
 * the cell already has colour the ring without a single extra rule.
 */
function DueMark({value}){
    const fill = dueFill(value)
    if(!value) return null
    if(fill === null) return <Icon name='circle-exclamation' className="due-mark is-late"/>
    return (
        <span className="due-mark due-dot" style={{'--fill': `${Math.round(fill * 100)}%`}}/>
    )
}

/** The same "MMM d" the picker itself shows, in the browser's language. */
function formatDate(value){
    if(!value) return ''
    const date = new Date(value)
    if(Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})
}
