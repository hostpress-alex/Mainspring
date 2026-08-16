import {useState} from 'react'

import {Icon} from '../icon'
import {Avatar} from '../avatar'
import {addSubtaskAction, updateTaskAction, removeTaskAction} from '../../store/board.actions'
import {boardService} from '../../services/board.service'
import {utilService} from '../../services/util.service'
import {confirmDelete} from '../confirm-dialog'
import {StatusPicker} from './status-picker'
import {t} from '../../i18n'
import './subtask.css'

/**
 * The subtasks of the open task.
 *
 * The table shows the same children in full width with every column. This is
 * the short form: title, whoever it is on, and the one column that says how
 * far it has got. Creating happens here because this is where there is room
 * for it — in a table row there is not.
 *
 * Which column counts as "how far it has got": the first status column of the
 * board. Not configurable on purpose. A second setting for a panel that shows
 * one column is a setting nobody will find, and a board that wants more detail
 * has the table.
 */
export function SubtaskPanel({task, board, groupId}){
    const [draft, setDraft] = useState('')
    const [isBusy, setIsBusy] = useState(false)
    const subtasks = task.subtasks || []
    const statusColumn = (board.columns || []).find(c => c.type === 'status') || null
    const members = new Map((board.members || []).filter(Boolean).map(m => [String(m._id), m]))

    async function onAdd(ev){
        ev.preventDefault()
        const title = draft.trim()
        if(!title || isBusy) return
        setIsBusy(true)
        try {
            await addSubtaskAction(board, groupId, task.id,
                {...boardService.getEmptyTask(), id: utilService.makeId(), title})
            setDraft('')
        } catch(err) {
            console.error('cannot add the subtask', err)
        } finally {
            setIsBusy(false)
        }
    }

    async function onUpdate(subtask, field, value, activity){
        try {
            await updateTaskAction(board, groupId, {...structuredClone(subtask), [field]: value}, activity)
        } catch(err) {
            console.error('cannot save the subtask', err)
        }
    }

    async function onRemove(subtask){
        if(!await confirmDelete({
            what: subtask.title || t('task.subtask'),
            button: t('common.delete')
        })) return
        try {
            await removeTaskAction(board, groupId, subtask.id)
        } catch(err) {
            console.error('cannot delete the subtask', err)
        }
    }

    return (
        <section className="subtask-panel">
            <header className="subtask-panel-head">
                <h3>{t('task.subtasks')}</h3>
                {subtasks.length > 0 && <span className="subtask-panel-count">{subtasks.length}</span>}
            </header>

            <ul className="subtask-panel-list">
                {subtasks.map(subtask => (
                    <li key={subtask.id} className="subtask-panel-row">
                        <input
                            className="subtask-panel-title"
                            defaultValue={subtask.title}
                            onBlur={ev => {
                                const value = ev.target.value.trim()
                                if(value && value !== subtask.title) onUpdate(subtask, 'title', value)
                            }}
                            onKeyDown={ev => {
                                if(ev.key === 'Enter') ev.currentTarget.blur()
                                if(ev.key === 'Escape'){
                                    ev.currentTarget.value = subtask.title
                                    ev.currentTarget.blur()
                                }
                            }}
                        />

                        <span className="subtask-panel-people">
                            {(subtask.memberIds || []).map(id => {
                                const member = members.get(String(id))
                                return <Avatar key={id} src={member && member.imgUrl} title={member?member.fullname:undefined}/>
                            })}
                        </span>

                        {statusColumn && (
                            <span className="subtask-panel-status">
                                <StatusPicker
                                    info={subtask}
                                    column={statusColumn}
                                    field={statusColumn.field || statusColumn.id}
                                    onUpdate={(field, value, activity) => onUpdate(subtask, field, value, activity)}
                                />
                            </span>
                        )}

                        <button type="button" className="subtask-remove" title={t('task.deleteSubtask')}
                                onClick={() => onRemove(subtask)}>
                            <Icon name='trash-can' variant='fa-regular'/>
                        </button>
                    </li>
                ))}
            </ul>

            <form className="subtask-panel-add" onSubmit={onAdd}>
                <Icon name='plus'/>
                <input
                    type="text"
                    value={draft}
                    placeholder={t('task.addSubtask')}
                    onChange={ev => setDraft(ev.target.value)}
                    onBlur={onAdd}
                />
            </form>
        </section>
    )
}
