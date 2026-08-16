import {useMemo, useState} from 'react'

import {Icon} from '../icon'
import {t} from '../../i18n'
import './parent-picker.css'

/**
 * Pick the task a selected task should hang under.
 *
 * Grouped by group and searchable, because a board with sixty tasks makes a
 * flat list useless. Offered is every top-level task except the ones being
 * converted.
 *
 * A task that already has children is a perfectly good parent for one more —
 * the first version of this disabled exactly those, which had the one-level
 * rule on the wrong side. The rule is about the task being CONVERTED: a task
 * with children of its own cannot become a child, because its children would
 * end up on the second level. Nothing about the target. That check therefore
 * sits where the selection is, not here.
 *
 * The number of children a candidate has is shown, as information rather than
 * a refusal: it is worth knowing what you are hanging something under.
 */
export function ParentPicker({board, excludeIds = [], onPick, onClose}){
    const [needle, setNeedle] = useState('')
    const exclude = useMemo(() => new Set(excludeIds.map(String)), [excludeIds])

    const groups = useMemo(() => {
        const q = needle.trim().toLowerCase()
        return (board.groups || []).map(group => ({
            ...group,
            candidates: (group.tasks || [])
                .filter(task => !exclude.has(String(task.id)))
                .filter(task => !q || String(task.title || '').toLowerCase().includes(q))
        })).filter(group => group.candidates.length)
    }, [board.groups, needle, exclude])

    return (
        <div className="parent-picker" onMouseDown={ev => ev.stopPropagation()} onClick={ev => ev.stopPropagation()}>
            <header className="parent-picker-head">
                <span>{t('task.convertPick')}</span>
                <button type="button" className="parent-picker-close" onClick={onClose} title={t('common.close')}>
                    <Icon name='xmark'/>
                </button>
            </header>

            <div className="parent-picker-search">
                <Icon name='magnifying-glass'/>
                <input
                    autoFocus
                    type="text"
                    value={needle}
                    placeholder={t('task.convertSearch')}
                    onChange={ev => setNeedle(ev.target.value)}
                />
            </div>

            <div className="parent-picker-scroll">
                {!groups.length && <p className="parent-picker-empty">{t('task.noTarget')}</p>}

                {groups.map(group => (
                    <section key={group.id} className="parent-picker-group">
                        <h4 style={{'--group-color': group.color}}>{group.title}</h4>
                        <ul>
                            {group.candidates.map(task => {
                                const children = (task.subtasks || []).length
                                return (
                                    <li key={task.id}>
                                        <button
                                            type="button"
                                            className="parent-picker-item"
                                            style={{'--group-color': group.color}}
                                            onClick={() => onPick(task, group)}>
                                            <span className="parent-picker-name">{task.title}</span>
                                            {children > 0 &&
                                                <span className="parent-picker-note">{t('task.subtaskCount', {n: children})}</span>}
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    </section>
                ))}
            </div>
        </div>
    )
}
