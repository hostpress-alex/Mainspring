import {Icon} from '../icon'
import {asHours} from '../../services/workhours.service'
import {getLanguage, t} from '../../i18n'

/**
 * What the planner did, and what it could not do.
 *
 * The second half is the reason this panel exists at all. Laying blocks is
 * the visible part and needs no explanation — it is on the screen behind
 * this. What somebody has to be told is the work that did NOT get a place,
 * because that is the only part they can act on: a deadline that cannot be
 * met is a conversation with somebody, a full week is a decision, a task
 * without a duration is thirty seconds of typing.
 *
 * So the panel is not a success message. It closes on its own for nothing;
 * it is dismissed when it has been read.
 */
export function PlanReport({report, onClose}){
    if(!report) return null
    const language = getLanguage()

    const {blocks = [], unplaced = [], skipped = [], assumedCount = 0} = report
    const minutes = blocks.reduce((sum, b) => sum + (b.end - b.start) / 60000, 0)

    // Only the reasons worth a line. "Has subtasks" is a fact about the board
    // and not something anybody needs to be told after every run.
    const shownSkipped = skipped.filter(s => s.reason !== 'hasSubtasks')

    return (
        <section className="plan-report">
            <header className="plan-report-head">
                <span className="plan-report-title">
                    {t('planner.result', {n: blocks.length, hours: asHours(minutes, language)})}
                </span>
                <button type="button" className="plan-report-close" onClick={onClose} title={t('common.close')}>
                    <Icon name="xmark"/>
                </button>
            </header>

            {assumedCount > 0 && (
                <p className="plan-report-line is-assumed">
                    <Icon name="circle-question"/>
                    {/* Said every time, not once: a calendar built partly on
                        guesses looks exactly like one that is not. */}
                    <span>{t('planner.assumed', {n: assumedCount})}</span>
                </p>
            )}

            {unplaced.length > 0 && (
                <div className="plan-report-group">
                    <h4>{t('planner.unplacedTitle', {n: unplaced.length})}</h4>
                    <ul>
                        {unplaced.map(item => (
                            <li key={item.taskId}>
                                <span className="plan-report-task">{item.title}</span>
                                <span className="plan-report-why">
                                    {t(`planner.reason.${item.reason}`, {
                                        hours: asHours(item.remainingMin, language)
                                    })}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {shownSkipped.length > 0 && (
                <div className="plan-report-group is-quiet">
                    <h4>{t('planner.skippedTitle', {n: shownSkipped.length})}</h4>
                    <ul>
                        {shownSkipped.map(item => (
                            <li key={item.taskId}>
                                <span className="plan-report-task">{item.title}</span>
                                <span className="plan-report-why">{t(`planner.reason.${item.reason}`)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {!unplaced.length && !shownSkipped.length && blocks.length > 0 && (
                <p className="plan-report-line">{t('planner.allFits')}</p>
            )}

            {!blocks.length && !unplaced.length && (
                <p className="plan-report-line">{t('planner.nothingToDo')}</p>
            )}
        </section>
    )
}
