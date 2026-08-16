import { Icon } from '../icon'
import {setDynamicModalObj} from '../../store/board.actions'
import {t} from '../../i18n'

export function ChartTypeModal({dynamicModalObj}){

    function onSetChartType(chartType){
        dynamicModalObj.setChartType(chartType)
        setDynamicModalObj({...dynamicModalObj, isOpen: false})
    }

    return (
        <section className="chart-type-modal">
            <div onClick={() => onSetChartType('pie')}>
                <Icon name='chart-pie'/>
                <span>{t('chart.pie')}</span>
            </div>
            <div onClick={() => onSetChartType('doughnut')}>
                <Icon name='chart-pie'/>
                <span>{t('chart.donut')}</span>
            </div>
            <div onClick={() => onSetChartType('bar')}>
                <Icon name='chart-column'/>
                <span>{t('chart.bars')}</span>
            </div>
        </section>
    )
}