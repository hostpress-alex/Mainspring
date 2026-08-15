import { Tooltip } from '@mui/material'
import { updateGroupAction } from '../../store/board.actions'
import { singleLineEditable } from '../../services/editable'
import { TaskListKanban } from './task-list-kanban'
import { t } from '../../i18n'

export function GroupPreviewKanban ({ group, board, index }) {

    async function onSave (ev) {
        const value = ev.target.innerText
        group.title = value
        try {
            await updateGroupAction(board, group)
        } catch (err) {
            console.log('saving failed')
        }
    }
    return (
        <section className="group-preview-kanban" >
            <div className={`group-header ${!board.description ? ' not-des' : ''}`}>
                <div className='group-title-container' style={{ '--group-color': group.color }}>
                    <blockquote className="group-title" contentEditable onBlur={(ev) => onSave(ev)} suppressContentEditableWarning={true}
                        {...singleLineEditable()}>
                        <Tooltip title={group.title} arrow>
                            <span>{group.title}</span>
                        </Tooltip>
                    </blockquote>
                </div>
            </div>
            <TaskListKanban board={board} group={group} index={index} />
        </section >
    )
}
