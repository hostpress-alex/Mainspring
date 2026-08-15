import React, { useRef, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Bar, Doughnut, Pie } from 'react-chartjs-2';
import { BiDotsHorizontalRounded } from 'react-icons/bi';
import { setDynamicModalObj } from '../../store/board.actions';
ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend);


export function LabelChart ({ board, dynamicModalObj }) {
  const elModalBtn = useRef()
  const [chartType, setChartType] = useState('pie')
    const data = {
        labels: getLabelTitles(),
        datasets: [
          {
            label: 'board labels',
            data: getData(),
            backgroundColor: getLabelColors(),
            borderColor: getLabelColors(),
            borderWidth: 1,
          },
        ],
      }

      /**
       * Labels haengen seit der Umstellung an der Spalte, nicht mehr am Board.
       * Fuer die Auswertung werden die Listen aller Status- und
       * Prioritaets-Spalten zusammengefasst; gleiche Titel zaehlen zusammen.
       */
      function getLabelColumns() {
        return (board.columns || []).filter(c => c.type === 'status' || c.type === 'priority')
      }

      function getLabels() {
        const seen = new Map()
        for (const column of getLabelColumns()) {
          for (const label of (column.labels || [])) {
            if (!label || seen.has(label.title)) continue
            seen.set(label.title, label)
          }
        }
        // Rueckfall fuer Boards, die noch keine spaltenweisen Listen haben.
        if (!seen.size) {
          for (const label of (board.labels || [])) {
            if (label && !seen.has(label.title)) seen.set(label.title, label)
          }
        }
        return [...seen.values()]
      }

      function getLabelTitles() {
        return getLabels().map(label => label.title || 'empty')
      }

      function getLabelColors() {
        return getLabels().map(label => label.color)
      }

      function getData() {
        const labelTitles = getLabels().map(label => label.title)
        const fields = getLabelColumns().map(c => c.field || c.id)
        const data = new Array(labelTitles.length).fill(0)
        board.groups.forEach(group => group.tasks.forEach(task => {
            fields.forEach(field => {
                const idx = labelTitles.indexOf(task[field])
                if (idx >= 0) data[idx]++
            })
        }))

        return data
      }

      function onToggleTypeModal() {
        const isOpen = dynamicModalObj.chartType === 'label' && dynamicModalObj?.type === 'chart-type' ? !dynamicModalObj.isOpen : true
        const { x, y } = elModalBtn.current.getClientRects()[0]
        setDynamicModalObj({ isOpen, pos: { x: (x - 110), y: (y + 20) }, type: 'chart-type', chartType: 'label', setChartType  })
      }

      function getChart(chartType) {
        switch (chartType) {
          case 'pie':
              return <Pie data={data} />
          case 'bar':
              return <Bar data={data} />
          case 'doughnut':
              return <Doughnut data={data} />
          default: return
        }
      }

    return (
        <section className='label-chart'>
          <div className='chart-header'>
            <div className='header-content'>
              <h2>Diagramm: Labels</h2>
              <span className='icon-container' ref={elModalBtn} onClick={onToggleTypeModal}>
                <BiDotsHorizontalRounded />
              </span>
            </div>
          </div>
          <div className='chart-content'>
            {getChart(chartType)}
          </div>
        </section>

    )
}