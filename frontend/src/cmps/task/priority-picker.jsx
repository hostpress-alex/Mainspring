import { useRef } from "react"
import { useSelector } from "react-redux"
import { boardService } from "../../services/board.service"
import { setDynamicModalObj } from "../../store/board.actions"

export function PriorityPicker({ info, onUpdate, field = 'priority', column }) {
    const board = useSelector(storeState => storeState.boardModule.board)
    const dynamicModalObj = useSelector(storeState => storeState.boardModule.dynamicModalObj)
    const elPrioritySection = useRef()

    // Siehe status-picker: die Liste gehoert zur Spalte, nicht zum Board.
    const labels = (column && Array.isArray(column.labels)) ? column.labels : (board.labels || [])
    const label = labels.find(label => label.title === info[field])
    const color = label ? label.color : '#c4c4c4'
    const activity = boardService.getEmptyActivity()
    activity.from = label
    activity.task = {id: info.id, title: info.title}

    function onToggleMenuModal() {
        const isOpen = dynamicModalObj?.task?.id === info.id && dynamicModalObj?.type === 'priority' ? !dynamicModalObj.isOpen : true
        const { x, y } = elPrioritySection.current.getClientRects()[0]
        setDynamicModalObj({ isOpen, pos: { x: (x - 35), y: (y + 38) }, type: 'priority', field, column, task: info, onTaskUpdate: onUpdate, activity: activity })
    }
    return <section ref={elPrioritySection} className="status-priority-picker picker" style={{ backgroundColor: color }} onClick={onToggleMenuModal}>
        <div>{info[field]}</div>
        <span className="fold"></span>
    </section>
}