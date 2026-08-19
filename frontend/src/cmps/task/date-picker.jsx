import {forwardRef} from 'react'
import DatePicker, {registerLocale} from 'react-datepicker'
import {de} from 'date-fns/locale/de'

import 'react-datepicker/dist/react-datepicker.css'
import {boardService} from '../../services/board.service'
import {Icon} from '../icon'
import {dueFill, dueLabel, dueTone} from '../../services/due-date'
import {getLanguage} from '../../i18n'

/**
 * The month names in the calendar itself come from date-fns, which speaks
 * English until a locale is handed to it. One import for the one other
 * language this application has; anything else falls back to English, which
 * is what it did for every language before.
 */
registerLocale('de', de)

export function DueDate({info, onUpdate, field = 'dueDate', column, readOnly = false}){

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
            <DatePicker
                popperClassName="date-picker-input"
                locale={getLanguage() === 'de'?'de':undefined}
                selected={info[field] || null}
                onChange={onChange}
                customInput={<DateTrigger value={info[field]} label={(column && column.title) || undefined}/>}
            />
        </section>
    )
}

/**
 * What opens the calendar.
 *
 * A button rather than the input react-datepicker brings along, for one
 * reason that is not cosmetic: an input is a replaced element, so its width
 * comes from the `size` attribute and `width: max-content` does nothing to
 * it. Fitting a cell to its date meant either counting characters in `ch` or
 * measuring a hidden copy of the text. A button just fits.
 *
 * A button and not a div: focusable by tab, opens on Enter and Space, and
 * announces itself — all of which a div would have to be given back by hand
 * with tabIndex, a role and two key handlers.
 *
 * The price, and it is a real one: the date can no longer be typed. It is
 * picked. `value` from react-datepicker is ignored on purpose — it is
 * formatted by date-fns in its own idea of the language, and this cell has to
 * agree with every other date in the application.
 */
const DateTrigger = forwardRef(function DateTrigger({value, label, onClick}, ref){
    const text = formatDate(value)
    return (
        <button type="button" ref={ref} onClick={onClick} aria-label={label}
                className={`date-trigger${text?'':' is-empty'}`}>
            {text || '—'}
        </button>
    )
})
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

/**
 * "14. Sep", in the language of the account.
 *
 * Not `toLocaleDateString(undefined, …)`: that follows the operating system,
 * so a German account on an English laptop read its dates in English while
 * everything around them was German.
 */
function formatDate(value){
    if(!value) return ''
    const date = new Date(value)
    if(Number.isNaN(date.getTime())) return ''
    return new Intl.DateTimeFormat(getLanguage(), {month: 'short', day: 'numeric'}).format(date)
}
