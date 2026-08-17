import DatePicker from 'react-datepicker'

import 'react-datepicker/dist/react-datepicker.css'
import {boardService} from '../../services/board.service'

export function DueDate({info, onUpdate, field = 'dueDate', readOnly = false}){

    const activity = boardService.getEmptyActivity()
    activity.action = 'date'
    activity.from = info[field]
    activity.task = {id: info.id, title: info.title}

    function onChange(data){
        activity.to = data.getTime()
        onUpdate(field, data.getTime(), activity)
    }

    // Not the datepicker with `disabled`: that greys the date out, and the
    // date is exactly what a viewer came to read. The same text without the
    // machinery behind it.
    if(readOnly){
        return (
            <section className="picker date-picker is-readonly">
                <span className="date-readonly">{formatDate(info[field])}</span>
            </section>
        )
    }

    return (
        <section className="picker date-picker ">
            <DatePicker popperClassName="date-picker-input" dateFormat="MMM d" selected={info[field] || null} onChange={onChange}/>
        </section>
    )
}
/** The same "MMM d" the picker itself shows, in the browser's language. */
function formatDate(value){
    if(!value) return ''
    const date = new Date(value)
    if(Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})
}
