import { FcPieChart, FcDoughnutChart, FcBarChart } from 'react-icons/fc'
import { setDynamicModalObj } from '../../store/board.actions'

export function ChartTypeModal({ dynamicModalObj }) {

    function onSetChartType(chartType) {
        dynamicModalObj.setChartType(chartType)
        setDynamicModalObj({ ...dynamicModalObj, isOpen: false })
    }

    return (
        <section className="chart-type-modal">
            <div onClick={() => onSetChartType('pie')}>
                <FcPieChart />
                <span>Kreis</span>
            </div>
            <div onClick={() => onSetChartType('doughnut')}>
                <FcDoughnutChart />
                <span>Ring</span>
            </div>
            <div onClick={() => onSetChartType('bar')}>
                <FcBarChart />
                <span>Balken</span>
            </div>
        </section>
    )
}