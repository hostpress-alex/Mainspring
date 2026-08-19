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
 * Minutes -> what the dialog should show when it opens again.
 *
 * Hours when they divide cleanly, minutes otherwise. Days are deliberately
 * not offered back: they are a shortcut for typing, and reading "1 Tag" where
 * the cell says "8 Std." makes the two look like different values. 90 stays
 * "90 minutes" rather than becoming 1.5 hours — a field that rounds what
 * somebody typed is a field they stop trusting.
 */
export function splitEstimate(minutes){
    const total = Math.max(0, Math.round(Number(minutes) || 0))
    if(!total) return {amount: '', unit: 'hours'}
    if(total % 60 === 0) return {amount: total / 60, unit: 'hours'}
    return {amount: total, unit: 'minutes'}
}

/**
 * An estimate, read back as an amount of time.
 *
 * Always hours and minutes, never days — even when it was typed as days. The
 * unit in the dialog is a way of typing, not a property of the value: what is
 * stored is a number of minutes, and the cell next to it shows recorded time
 * in hours. "5 Std. 12 Min. / 1 Tg." asks the reader to convert in their head
 * before they can tell whether it fits.
 */
export function formatEstimate(minutes){
    return formatDuration(Math.max(0, Math.round(Number(minutes) || 0)) * 60000)
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
