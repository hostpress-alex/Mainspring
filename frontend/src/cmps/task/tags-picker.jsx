import {useRef} from 'react'
import {useSelector} from 'react-redux'

import {setDynamicModalObj} from '../../store/board.actions'
import {tagsOf, findTagById, valueOf, withoutTag} from '../../services/tags'
import {t} from '../../i18n'

/**
 * The tags of one task.
 *
 * Chips with a cross, and the cell itself opens the list. Two details that
 * are not decoration:
 *
 *   - A tag whose definition is gone is simply not drawn. The value keeps the
 *     id, so a tag deleted by accident and re-created with the same id would
 *     come back; drawing a chip with no name would be worse than drawing
 *     nothing.
 *   - The cross removes the tag from THIS task and never from the list. The
 *     list is edited in one place — see modal-tags — because a control that
 *     sometimes deletes a word from a board and sometimes only from a row is
 *     a control people stop touching.
 */
export function TagsPicker({info, onUpdate, field, column, readOnly = false}){
    const board = useSelector(storeState => storeState.boardModule.board)
    const dynamicModalObj = useSelector(storeState => storeState.boardModule.dynamicModalObj)
    const elCell = useRef()

    const tags = tagsOf(column)
    const value = valueOf(info, field)
    const shown = value.map(id => findTagById(tags, id)).filter(Boolean)

    function onOpen(ev){
        if(readOnly) return
        // A click on a cross is not a click on the cell.
        if(ev.target.closest('.tag-chip-remove')) return
        const isOpen = dynamicModalObj?.task?.id === info.id && dynamicModalObj?.type === 'tags'
            ?!dynamicModalObj.isOpen
            :true
        const {x, y, height} = elCell.current.getClientRects()[0]
        setDynamicModalObj({
            isOpen,
            pos: {x: x - 10, y: y + height},
            type: 'tags',
            field,
            column,
            task: info,
            onTaskUpdate: onUpdate
        })
    }

    function onRemove(id){
        onUpdate(field, withoutTag(value, id))
    }

    return (
        <section ref={elCell} className={`picker tags-picker${readOnly?' is-readonly':''}`} onClick={onOpen}>
            {shown.length === 0 && <span className="tags-empty">—</span>}
            {shown.map(tag => (
                <span className="tag-chip" key={tag.id} style={{'--tag-color': tag.color}}>
                    <span className="tag-chip-title">#{tag.title}</span>
                    {!readOnly && (
                        <button type="button" className="tag-chip-remove" title={t('tags.removeFromTask')}
                            onClick={() => onRemove(tag.id)}>×</button>
                    )}
                </span>
            ))}
        </section>
    )
}
