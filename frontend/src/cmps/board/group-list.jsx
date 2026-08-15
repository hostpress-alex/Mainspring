import { DragDropContext, Droppable } from '@hello-pangea/dnd'

import { GroupPreview } from './group-preview'
import { handleOnDragEnd } from "../../store/board.actions"

import { useRef } from 'react'
import { loadWidths, widthOf } from './column-width'

export function GroupList({ board }) {
    const containerRef = useRef()

    function getCellWidth() {
        const widths = loadWidths(board._id)
        return (board.columns || []).reduce((acc, column) => acc + widthOf(widths, column), 600)
    }

    if (!board.groups) return <div></div>
    return <div ref={containerRef} className='group-list-inner' style={{ '--cell-width': `${getCellWidth()}px` }}>
        <DragDropContext onDragEnd={(ev) => handleOnDragEnd(ev, board)}>
            <Droppable droppableId={board._id} type='group'>
                {(droppableProvided) => {
                    return <section ref={droppableProvided.innerRef}{...droppableProvided.droppableProps} className="group-list">
                        <ul>
                            {board.groups.map((group, idx) => {
                                return (
                                    <li key={idx}><GroupPreview idx={idx} group={group} board={board} /></li>)
                            })}
                        </ul>
                    </section>
                }}
            </Droppable>
        </DragDropContext>
    </div>
}