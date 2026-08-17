import {Tooltip} from '@mui/material'

import {updateGroupAction} from '../../store/board.actions'
import {singleLineEditable} from '../../services/editable'
import {TaskListKanban} from './task-list-kanban'
import {useSelector} from 'react-redux'
import * as boardRoles from '../../services/board-roles'

export function GroupPreviewKanban({group, board, index}){
    const user = useSelector(storeState => storeState.userModule.user)
    // A group belongs to whoever made it — the same rule the table uses and
    // the same one the server checks.
    const canManage = boardRoles.canManageGroup(board, user, group)

    async function onSave(ev){
        const title = ev.target.innerText.trim()
        if(!canManage || !title || title === group.title) return
        try {
            // A new object, not `group.title = title`. updateGroupAction works
            // out what changed by comparing against the state it holds, and
            // writing into that state first leaves nothing to find.
            await updateGroupAction(board, {...group, title})
        } catch(err) {
            console.error('cannot save the group title', err)
        }
    }

    return (
        <section className="group-preview-kanban">
            <div className="group-header">
                <div className="group-title-container" style={{'--group-color': group.color}}>
                    <blockquote className="group-title" contentEditable={canManage} onBlur={onSave} suppressContentEditableWarning={true}
                                {...singleLineEditable()}>
                        <Tooltip title={group.title} arrow>
                            <span>
                                {group.icon && <span className="group-icon-static">{group.icon}</span>}
                                {group.title}
                            </span>
                        </Tooltip>
                    </blockquote>
                </div>
            </div>
            <TaskListKanban board={board} group={group} index={index}/>
        </section>
    )
}
