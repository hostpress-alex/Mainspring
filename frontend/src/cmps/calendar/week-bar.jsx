import {asHours} from '../../services/workhours.service'
import {getLanguage, t} from '../../i18n'

/**
 * What the visible window costs, in four numbers.
 *
 * Available, planned, recorded, estimated. They are shown side by side and
 * not reduced to a percentage on purpose: they measure four different things,
 * and which of them matters depends on the question. "87 % ausgelastet" would
 * answer a question nobody asked and hide the three numbers that would have.
 *
 * The bar only compares the two that are comparable — planned against
 * available — because that is the one pair where being over the line means
 * something definite: more has been put in the calendar than there are hours
 * to do it in.
 */
export function WeekBar({summary, view}){
    if(!summary) return null
    const language = getLanguage()

    const {availableMin, plannedMin, trackedMin, estimateMin} = summary
    const isOverbooked = availableMin > 0 && plannedMin > availableMin
    const fill = availableMin > 0?Math.min(100, (plannedMin / availableMin) * 100):0

    return (
        <div className={`cal-weekbar${isOverbooked?' is-over':''}`}>
            <div className="cal-weekbar-nums">
                <Figure label={t('workhours.available')} minutes={availableMin} language={language} isStrong/>
                <Figure label={t('workhours.planned')} minutes={plannedMin} language={language}/>
                <Figure label={t('workhours.tracked')} minutes={trackedMin} language={language}/>
                {/* Only tasks that are due inside this window carry an
                    estimate into this number — see workhours.repo. */}
                <Figure label={t('workhours.estimated')} minutes={estimateMin} language={language}/>
            </div>

            {availableMin > 0 && (
                <div className="cal-weekbar-track" title={t('workhours.barTitle')}>
                    <div className="cal-weekbar-fill" style={{width: `${fill}%`}}/>
                </div>
            )}

            {availableMin === 0 && (
                <span className="cal-weekbar-hint">{t('workhours.noneHint')}</span>
            )}
            {view === 'day' && <span className="cal-weekbar-hint">{t('workhours.dayHint')}</span>}
        </div>
    )
}

function Figure({label, minutes, language, isStrong = false}){
    return (
        <span className={`cal-weekbar-figure${isStrong?' is-strong':''}`}>
            <span className="cal-weekbar-value">{t('workhours.hours', {n: asHours(minutes, language)})}</span>
            <span className="cal-weekbar-label">{label}</span>
        </span>
    )
}
