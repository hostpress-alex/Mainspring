import {Draggable, Droppable} from '@hello-pangea/dnd'

import {TaskPreviewKanban} from './task-preview-kanban'
import {TaskTitleKanban} from './task-title-kanban'

/**
 * The cards of one group.
 *
 * No column widths here any more. They come from `column-width.js`, are stored
 * per board and are dragged in the table — a Kanban card is not a table row and
 * has no business being 87 pixels wide because the Person column in the table
 * is. The card sets its own width; the fields inside it fill it.
 */
export function TaskListKanban({board, group}){
    return (
        <Droppable droppableId={group.id} type="task">
            {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="task-list-kanban">
                    <ul className="task-list-content-kanban">
                        {(group.tasks || []).map((task, idx) => (
                            <li key={task.id} className="task-container">
                                <Draggable draggableId={task.id} index={idx} key={task.id} type="task">
                                    {(provided) => (
                                        <article
                                            className="kanban-card"
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            {...provided.dragHandleProps}
                                        >
                                            <TaskTitleKanban task={task} group={group} board={board}/>
                                            <TaskPreviewKanban task={task} group={group} board={board}/>
                                        </article>
                                    )}
                                </Draggable>
                            </li>
                        ))}
                        {provided.placeholder}
                    </ul>
                </div>
            )}
        </Droppable>
    )
}
