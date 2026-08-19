import {useRef} from 'react'
import {useSelector} from 'react-redux'

import {setDynamicModalObj} from '../../store/board.actions'
import {boardService} from '../../services/board.service'
import {formatDuration} from '../../services/time.service'
import {useBoardTotals} from '../time/use-board-totals'
import {t} from '../../i18n'

/**
 * How long this is expected to take, against how long it has taken.
 *
 * Stored as a plain number of minutes. Not "2h 30m" as text, not an object
 * with a unit: a number is the only form that can be summed for a group,
 * compared with the tracked time, and read back the same way in every
 * language. The unit is a matter of typing it in, and belongs in the input
 * rather than in the database.
 *
 * The second half — the time actually recorded — comes from the time
 * tracking that is already there, through the same board-wide cache the task
 * dialog uses. One request per board, however many rows it has.
 */

/** A day of work, in minutes. Not 24 hours: nobody estimates in nights. */
export const WORKDAY_MINUTES = 8 * 60

export const ESTIMATE_UNITS = [
    {key: 'minutes', minutes: 1},
    {key: 'hours', minutes: 60},
    {key: 'days', minutes: WORKDAY_MINUTES}
]

/**
 * Minutes -> the largest unit that divides them cleanly.
 *
 * So 480 comes back as "1 day" rather than "480 minutes", and 90 stays "90
 * minutes" instead of becoming "1.5 hours" — a field that rounds what
 * somebody typed is a field they stop trusting.
 */
export function splitEstimate(minutes){
    const total = Math.max(0, Math.round(Number(minutes) || 0))
    if(!total) return {amount: '', unit: 'hours'}
    for(const unit of [...ESTIMATE_UNITS].reverse()){
        if(total % unit.minutes === 0) return {amount: total / unit.minutes, unit: unit.key}
    }
    return {amount: total, unit: 'minutes'}
}

/**
 * An estimate, read back in the unit it was most likely given in.
 *
 * formatDuration stops at hours, which is right for time that was measured —
 * sixteen hours on a stopwatch are sixteen hours. An estimate of two days is
 * not: it was typed as two days, and reading it back as "16 Std." makes
 * people check whether it saved what they meant.
 */
export function formatEstimate(minutes){
    const total = Math.max(0, Math.round(Number(minutes) || 0))
    if(total >= WORKDAY_MINUTES && total % WORKDAY_MINUTES === 0){
        return `${total / WORKDAY_MINUTES} ${t('time.dayShort')}`
    }
    return formatDuration(total * 60000)
}

export function toMinutes(amount, unitKey){
    const unit = ESTIMATE_UNITS.find(u => u.key === unitKey) || ESTIMATE_UNITS[1]
    const n = Number(String(amount).replace(',', '.'))
    if(!Number.isFinite(n) || n < 0) return null
    return Math.round(n * unit.minutes)
}

export function EstimatePicker({info, onUpdate, field, column, board, readOnly = false}){
    const storeBoard = useSelector(storeState => storeState.boardModule.board)
    const dynamicModalObj = useSelector(storeState => storeState.boardModule.dynamicModalObj)
    const elCell = useRef()

    const boardId = (board && board._id) || (storeBoard && storeBoard._id)
    const totals = useBoardTotals(boardId)

    const minutes = Number(info[field])
    const hasEstimate = Number.isFinite(minutes) && minutes > 0
    const spent = Number(totals[info.id]) || 0
    const estimateMs = hasEstimate?minutes * 60000:0
    // Only once there is something to compare. An estimate with no time
    // against it is not "0% done", it is simply an estimate.
    const isOver = hasEstimate && spent > estimateMs

    function onOpen(){
        const isOpen = dynamicModalObj?.task?.id === info.id && dynamicModalObj?.type === 'estimate'?!dynamicModalObj.isOpen:true
        const {x, y, height} = elCell.current.getClientRects()[0]
        const activity = boardService.getEmptyActivity()
        activity.action = 'estimate'
        activity.from = hasEstimate?minutes:null
        activity.task = {id: info.id, title: info.title}
        setDynamicModalObj({
            isOpen,
            pos: {x: x - 10, y: y + height},
            type: 'estimate',
            field,
            column,
            task: info,
            onTaskUpdate: onUpdate,
            activity
        })
    }

    return (
        <section ref={elCell}
            className={`picker estimate-picker${readOnly?' is-readonly':''}${isOver?' is-over':''}`}
            title={hasEstimate?t('estimate.cellTitle', {
                spent: formatDuration(spent), estimate: formatEstimate(minutes)
            }):undefined}
            onClick={readOnly?undefined:onOpen}>
            {hasEstimate?(
                <span className="estimate-value">
                    {/* Recorded first, then the estimate. The question people
                        ask of this cell is "how are we doing", and that is
                        answered by the left half. */}
                    {spent > 0 && <span className="estimate-spent">{formatDuration(spent)}</span>}
                    {spent > 0 && <span className="estimate-sep">/</span>}
                    <span className="estimate-total">{formatEstimate(minutes)}</span>
                </span>
            ):(
                <span className="estimate-empty">—</span>
            )}
        </section>
    )
}
