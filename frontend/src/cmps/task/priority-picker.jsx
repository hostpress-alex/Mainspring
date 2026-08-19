import {useRef} from 'react'
import {useSelector} from 'react-redux'
import {boardService} from '../../services/board.service'
import {setDynamicModalObj} from '../../store/board.actions'
import {labelFor} from '../../services/column.service'
import {usePriorities} from '../../services/priority.store'

/**
 * The priority cell.
 *
 * Unlike the status next to it, this column does not own its values: they are
 * one global list an admin maintains, and the task stores the id of the entry
 * rather than its text. So the cell is a lookup, and it subscribes to the
 * list — when an admin renames "High" to "Hoch", fifteen open boards have to
 * change the word without anybody writing to a single task.
 */
export function PriorityPicker({info, onUpdate, field = 'priority', column, readOnly = false}){
    const board = useSelector(storeState => storeState.boardModule.board)
    const dynamicModalObj = useSelector(storeState => storeState.boardModule.dynamicModalObj)
    const elPrioritySection = useRef()
    // Subscribed rather than read: this is what re-renders the cell when the
    // list changes under it.
    usePriorities()

    const label = labelFor(board, {...column, type: 'priority'}, info[field])
    const color = label?label.color:'#c4c4c4'
    const activity = boardService.getEmptyActivity()
    activity.from = label
    activity.task = {id: info.id, title: info.title}

    function onToggleMenuModal(){
        const isOpen = dynamicModalObj?.task?.id === info.id && dynamicModalObj?.type === 'priority'?!dynamicModalObj.isOpen:true
        const {x, y} = elPrioritySection.current.getClientRects()[0]
        setDynamicModalObj({
            isOpen,
            pos: {x: (x - 35), y: (y + 38)},
            type: 'priority',
            field,
            column,
            task: info,
            onTaskUpdate: onUpdate,
            activity: activity
        })
    }

    return <section ref={elPrioritySection}
        className={`status-priority-picker picker${readOnly?' is-readonly':''}`}
        style={{'--label-color': color}} onClick={readOnly?undefined:onToggleMenuModal}>
        {/* The word comes from the list, never from the task. A value whose
            priority was deleted therefore shows an empty cell rather than an
            id — and the admin screen cannot leave one behind anyway, since
            deleting asks where the tasks should go. */}
        <div>{label?label.title:''}</div>
        <span className="fold"></span>
    </section>
}
