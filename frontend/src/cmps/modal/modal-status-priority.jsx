import {useState} from 'react'
import {useSelector} from 'react-redux'

import {setDynamicModalObj, closeDynamicModal, saveColumnLabels} from '../../store/board.actions'
import {LabelEditor} from './label-editor'
import {labelsOf, labelKey} from '../../services/column.service'
import {usePriorities} from '../../services/priority.store'
import { Icon } from '../icon'
import {t} from '../../i18n'

/**
 * Picker for status and priority columns.
 *
 * The two look identical and are not the same thing:
 *
 *   - A status list belongs to the column. Whoever may write on the board may
 *     edit it, and the value stored on a task is the label's text.
 *   - A priority list belongs to the whole installation. Only an admin
 *     changes it, in the admin area, and the value stored on a task is the
 *     id — which is why renaming one is a single row and not a rewrite of
 *     every board.
 *
 * So the editor button below appears for status only. Not disabled, not
 * hidden behind an error message: a button that is there and refuses is a
 * worse answer than a sentence saying where the list is kept.
 *
 * The editor is deliberately rendered WITHOUT the classes
 * .modal-status-priority(-content): their rules give every li a fixed height
 * of 32px and white text — meant for the colourful picker tiles, deadly for a
 * form.
 */
export function ModalStatusPriority({dynamicModalObj}){
    const board = useSelector(storeState => storeState.boardModule.board)
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [err, setErr] = useState(null)
    usePriorities()

    const column = dynamicModalObj.column
    const isPriority = dynamicModalObj.type === 'priority'
    // The type is taken from the popup rather than the column, because a
    // legacy priority column can still arrive here without one.
    const kind = isPriority?{...column, type: 'priority'}:column
    const labels = labelsOf(board, kind)

    function onClickModal(label){
        dynamicModalObj.activity.action = dynamicModalObj.type
        dynamicModalObj.activity.to = label
        dynamicModalObj.onTaskUpdate(
            dynamicModalObj.field || dynamicModalObj.type,
            labelKey(kind, label),
            dynamicModalObj.activity)
        setDynamicModalObj({...dynamicModalObj, isOpen: false})
    }

    async function onSaveLabels({labels: nextLabels, renames, removed}){
        setErr(null)
        setIsSaving(true)
        try {
            await saveColumnLabels(board, column, nextLabels, renames, removed)
            closeDynamicModal()
        } catch(e) {
            setErr(e?.response?.data?.err || t('label.saveFailed'))
            setIsSaving(false)
        }
    }

    if(isEditOpen && column && !isPriority){
        return (
            <LabelEditor column={column} board={board} isSaving={isSaving} err={err} onSave={onSaveLabels} onCancel={() => setIsEditOpen(false)}/>
        )
    }

    return (
        <section className="modal-status-priority">
            <Icon name='caret-up' className="triangle-icon"/>
            <section className="modal-status-priority-content">
                <ul>
                    {labels.map((label, idx) =>
                        <li onClick={() => onClickModal(label)} key={label.id || idx} style={{'--label-color': label.color}}>
                            {label.title}
                        </li>)}
                    {/* Taking a priority off again. The status lists carry an
                        empty label for this; the global list does not, because
                        an entry that means "none" would be one an admin could
                        rename. */}
                    {isPriority && (
                        <li className="is-clear" onClick={() => onClickModal(null)} style={{'--label-color': '#c4c4c4'}}>
                            {t('priority.none')}
                        </li>
                    )}
                </ul>
                {isPriority?(
                    <div className="modal-note">{t('priority.managedGlobally')}</div>
                ):(
                    <div className="edit-labels-btn">
                        <button type="button" title={column?t('label.editTitle'):t('label.notAvailable')} disabled={!column} onClick={() => setIsEditOpen(true)}>
                            <Icon name='pencil' className="icon"/>
                            <span>{t('label.edit')}</span>
                        </button>
                    </div>
                )}
            </section>
        </section>
    )
}
