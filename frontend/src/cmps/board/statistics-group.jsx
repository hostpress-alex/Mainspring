export function StatisticGroup({column, group, board}){
    const cmpType = column?.type
    const field = column?.field || column?.id

    function getStatisticsStatus(cmp){
        // Labels are matched by TITLE, not by id.
        // A task with an unknown status returned undefined here and tore down
        // the entire React tree without an error boundary.
        const source = Array.isArray(column?.labels)?column.labels:(board.labels || [])
        const labels = group.tasks.map(task => source.find(label => label.title === task[cmp])).filter(Boolean)
        if(!labels.length) return []
        const mapLabel = labels.reduce((acc, label) => {
            if(acc[label.color]) acc[label.color]++
            else acc[label.color] = 1
            return acc
        }, {})
        const result = []
        for(let key in mapLabel){
            result.push({background: key, width: `${mapLabel[key] / labels.length * 100}%`})
        }
        return result
    }

    function getStatisticsNumber(){
        return group.tasks.reduce((acc, task) => {
            const n = Number(task[field])
            return Number.isFinite(n)?acc + n:acc
        }, 0)
    }

    /** Anteil erledigter Checkboxen. */
    function getCheckedRatio(){
        const done = group.tasks.filter(t => Boolean(t[field])).length
        return `${done}/${group.tasks.length}`
    }

    function getStatisticsResult(){
        switch(cmpType) {
            case 'person':
                return
            case 'status':
            case 'priority':
            case 'dropdown':
                return <GetStatisticsLabel statisticLabels={getStatisticsStatus(field)}/>
            case 'number':
                return <GetStatisticsNumber statisticNumber={getStatisticsNumber()}/>
            case 'checkbox':
                return <GetStatisticsNumber statisticNumber={getCheckedRatio()}/>
            default:
                return []
        }
    }

    return (
        <>
            {getStatisticsResult()}
        </>
    )
}

function GetStatisticsLabel({statisticLabels}){
    return (
        statisticLabels.map((label, idx) => {
            return <span data-testid={`label-${idx}`} key={idx} style={label}></span>
        })
    )
}

function GetStatisticsNumber({statisticNumber}){
    return (
        <div role="contentinfo" className="statistic-number flex column align-center">
            <span className="number">{statisticNumber}</span>
        </div>
    )
}