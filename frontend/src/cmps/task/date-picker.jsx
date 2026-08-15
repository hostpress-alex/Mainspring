import DatePicker from "react-datepicker"

import "react-datepicker/dist/react-datepicker.css"
import { boardService } from "../../services/board.service"

export function DueDate({ info, onUpdate, field = 'dueDate' }) {

    const activity = boardService.getEmptyActivity()
    activity.action = 'date'
    activity.from = info[field]
    activity.task = {id: info.id, title: info.title}
    function onChange(data) {
        activity.to = data.getTime()
        onUpdate(field, data.getTime(), activity)
    }
    return (
        <section className="picker date-picker ">
            <DatePicker
                popperClassName="date-picker-input"
                dateFormat="MMM d"
                selected={info[field] || null}
                onChange={onChange}/>
        </section>
    )
}