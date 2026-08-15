import {FcPieChart, FcDoughnutChart, FcBarChart} from 'react-icons/fc'
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
                <FcPieChart/>
                <span>{t('chart.pie')}</span>
            </div>
            <div onClick={() => onSetChartType('doughnut')}>
                <FcDoughnutChart/>
                <span>{t('chart.donut')}</span>
            </div>
            <div onClick={() => onSetChartType('bar')}>
                <FcBarChart/>
                <span>{t('chart.bars')}</span>
            </div>
        </section>
    )
}