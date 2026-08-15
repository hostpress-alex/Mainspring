import {useState} from 'react'
import {Draggable, Droppable} from '@hello-pangea/dnd'

import {TaskPreviewKanban} from './task-preview-kanban'
import {useColumnWidths, widthOf, widthStyle} from '../board/column-width'
import {TitleGroupPreview} from '../board/title-group-preview'
import {TaskTitleKanban} from './task-title-kanban'

export function TaskListKanban({board, group}){
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
    const widths = useColumnWidths(board._id)

    return (
        <Droppable droppableId={group.id} type="task">
            {(provided) => (
                <div ref={provided.innerRef}
                     {...provided.droppableProps}>
                    <ul className="task-list-content-kanban">
                        {group.tasks.map((task, idx) => {
                            return <li key={task.id} className="task-container" onClick={(ev) => {
                                ev.stopPropagation()
                            }}>
                                <Draggable draggableId={task.id} index={idx} key={task.id} type="task">
                                    {(provided) => (
                                        <div {...provided.draggableProps}{...provided.dragHandleProps} ref={provided.innerRef} className="flex column">
                                            <TaskTitleKanban task={task} group={group} board={board}/>
                                            <div className="flex kanban-task-list">
                                                <div className="task-content">
                                                    <ul className="title-container">
                                                        {(board.columns || []).map(column =>
                                                            <li className={`${column.type}-picker cmp-order-title title`} key={column.id} style={widthStyle(widthOf(widths, column))}>
                                                                <TitleGroupPreview column={column} board={board} isKanban={true}/>
                                                            </li>
                                                        )}
                                                    </ul>
                                                </div>
                                                <div key={task.id}>
                                                    <TaskPreviewKanban task={task} group={group} board={board} widths={widths} isTaskModalOpen={isTaskModalOpen} setIsTaskModalOpen={setIsTaskModalOpen}/>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </Draggable>
                            </li>
                        })}
                        {provided.placeholder}
                    </ul>
                </div>
            )}
        </Droppable>
    )
}
