import {DragDropContext, Droppable} from '@hello-pangea/dnd'

import {GroupPreview} from './group-preview'
import {handleOnDragEnd} from '../../store/board.actions'

import {useRef} from 'react'
import {useColumnWidths, widthOf, TASK_COLUMN} from './column-width'

export function GroupList({board}){
    const containerRef = useRef()

    const widths = useColumnWidths(board._id)

    /**
     * Everything in a row that is not a column, in pixels.
     *
     * This number is a copy of CSS, which is why it went wrong: it was 264,
     * from a time when the "add column" cell was a column like any other. That
     * cell is `width: fit-content` now, and the ~150 pixels left over showed up
     * as white space to the right of every table once you scrolled across.
     *
     * Written out part by part so the next change to any of them is visible
     * here. Only the parts every row always has: the "+" cell at the end is
     * there for an owner and not for anybody else, and counting it would give
     * everyone else the same strip of nothing back. Too small costs nothing —
     * this is a minimum, and the rows are as wide as they are either way.
     * Too large is the direction that shows.
     */
    const BOARD_INDENT = 40    // .group-list   margin-left
    const GROUP_STRIPE = 6     // .sticky-div   border-left
    const CHECKBOX = 33        // .check-box    min-width
    const FRAME_WIDTH = BOARD_INDENT + GROUP_STRIPE + CHECKBOX

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