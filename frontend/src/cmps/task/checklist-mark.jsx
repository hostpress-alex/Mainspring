import {Tooltip} from '@mui/material'

import {checklistOf, fractionOf, isComplete} from '../../services/checklist'
import {t} from '../../i18n'

/**
 * How much of a task's checklists is ticked, as one mark in the row.
 *
 * **A stroked ring, deliberately not the filled circle used elsewhere.** That
 * shape is taken twice already and both times it means time: `cal-event-ring`
 * pours in how much of an estimate has been worked, `due-dot` how much of the
 * run-up to a deadline is gone. A third filled circle in the same row, saying
 * something that is not time at all, would be read as one of those two before
 * anybody thought about it.
 *
 * So this one fills around its edge instead, with a tick in the middle — the
 * same thing Monday draws, and the reason it works is that the tick says what
 * kind of progress it is before the ring says how much.
 *
 * Nothing is drawn for a task with no checklist: a row of empty rings across
 * every task would be noise on the many to say something about the few, and
 * "no checklist" is not "a checklist with nothing done".
 */

/** r = 8 in a 20-box, so the circumference the dash array works against. */
const R = 8
const CIRCUMFERENCE = 2 * Math.PI * R

export function ChecklistMark({task, onOpen}){
    const stats = checklistOf(task)
    if(!stats) return null

    const complete = isComplete(stats)
    /**
     * A sliver rather than nothing.
     *
     * One item of forty rounds to a hair and draws what looks like an empty
     * ring, which says "nothing done" — the one thing it is not. Same reason
     * the calendar ring keeps a floor of two per cent.
     */
    const done = fractionOf(stats)
    const filled = done > 0?Math.max(CIRCUMFERENCE * 0.04, CIRCUMFERENCE * done):0

    return (
        <Tooltip arrow title={t('task.checklistDone', {done: stats.done, total: stats.total})}>
            <div className={`checklist-mark${complete?' is-complete':''}`} onClick={onOpen}>
                <svg viewBox="0 0 20 20" aria-hidden="true">
                    <circle className="checklist-track" cx="10" cy="10" r={R}/>
                    {/* Rotated as an SVG attribute rather than in CSS: a CSS
                        transform on an SVG shape needs transform-box to be set
                        to behave, and this needs no stylesheet to be correct. */}
                    <circle className="checklist-fill" cx="10" cy="10" r={R}
                        transform="rotate(-90 10 10)"
                        strokeDasharray={`${filled} ${CIRCUMFERENCE}`}/>
                    <path className="checklist-tick" d="M6.4 10.1 L8.9 12.6 L13.6 7.4"/>
                </svg>
            </div>
        </Tooltip>
    )
}
