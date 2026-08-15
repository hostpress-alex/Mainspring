import {DragDropContext, Droppable} from '@hello-pangea/dnd'

import {GroupPreview} from './group-preview'
import {handleOnDragEnd} from '../../store/board.actions'

import {useRef} from 'react'
import {useColumnWidths, widthOf, TASK_COLUMN} from './column-width'

export function GroupList({board}){
    const containerRef = useRef()

    const widths = useColumnWidths(board._id)

    /**
     * Everything in a row that is not a column: checkbox, colour stripe,
     * the "add column" button. The task title used to be part of this fixed
     * block — it is now draggable and therefore counted like a column.
     */
    const FRAME_WIDTH = 264

    function getCellWidth(){
        const columnsWidth = (board.columns || []).reduce((acc, column) => acc + widthOf(widths, column), 0)
        return FRAME_WIDTH + widthOf(widths, TASK_COLUMN) + columnsWidth
    }

    if(!board.groups) return <div></div>
    return <div ref={containerRef} className="group-list-inner" style={{'--cell-width': `${getCellWidth()}px`}}>
        <DragDropContext onDragEnd={(ev) => handleOnDragEnd(ev, board)}>
            <Droppable droppableId={board._id} type="group">
                {(droppableProvided) => {
                    return <section ref={droppableProvided.innerRef}{...droppableProvided.droppableProps} className="group-list">
                        <ul>
                            {board.groups.map((group, idx) => {
                                return (
                                    <li key={idx}><GroupPreview idx={idx} group={group} board={board}/></li>)
                            })}
                        </ul>
                    </section>
                }}
            </Droppable>
        </DragDropContext>
    </div>
}