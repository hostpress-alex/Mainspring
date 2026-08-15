import { useState } from 'react'
import { useSelector } from 'react-redux'

import { setDynamicModalObj, closeDynamicModal, saveColumnLabels } from '../../store/board.actions'
import { LabelEditor } from './label-editor'
import { RxPencil1 } from 'react-icons/rx'
import { VscTriangleUp } from 'react-icons/vsc'
import { t } from '../../i18n'

/**
 * Picker for status and priority columns.
 *
 * Since the change the list belongs to the COLUMN (column.labels), no longer
 * to the board. board.labels stays only as a fallback for boards that have
 * never been read.
 *
 * The editor is deliberately rendered WITHOUT the classes
 * .modal-status-priority(-content): their rules give every li a fixed height
 * of 32px and white text — meant for the colourful picker tiles, deadly for a
 * form.
 */
export function ModalStatusPriority({ dynamicModalObj }) {
    const board = useSelector(storeState => storeState.boardModule.board)
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [err, setErr] = useState(null)

    const column = dynamicModalObj.column
    const labels = (column && Array.isArray(column.labels)) ? column.labels : (board?.labels || [])

    function onClickModal(labelTitle) {
        dynamicModalObj.activity.action = dynamicModalObj.type
        dynamicModalObj.activity.to = labels.find(label => label.title === labelTitle)
        dynamicModalObj.onTaskUpdate(dynamicModalObj.field || dynamicModalObj.type, labelTitle, dynamicModalObj.activity)
        setDynamicModalObj({ ...dynamicModalObj, isOpen: false })
    }

    async function onSaveLabels({ labels: nextLabels, renames, removed }) {
        setErr(null)
        setIsSaving(true)
        try {
            await saveColumnLabels(board, column, nextLabels, renames, removed)
            closeDynamicModal()
        } catch (e) {
            setErr(e?.response?.data?.err || t('label.saveFailed'))
            setIsSaving(false)
        }
    }

    if (isEditOpen && column) {
        return (
            <LabelEditor
                column={column}
                board={board}
                isSaving={isSaving}
                err={err}
                onSave={onSaveLabels}
                onCancel={() => setIsEditOpen(false)} />
        )
    }

    return (
        <section className="modal-status-priority">
            <VscTriangleUp className="triangle-icon" />
            <section className="modal-status-priority-content" >
                <ul>
                    {labels.map((label, idx) => <li onClick={() => onClickModal(label.title)} key={label.id || idx} style={{ '--label-color': label.color }}>
                        {label.title}
                    </li>)}
                </ul>
                <div className="edit-labels-btn">
                    <button type="button"
                        title={column ? t('label.editTitle') : t('label.notAvailable')}
                        disabled={!column}
                        onClick={() => setIsEditOpen(true)}>
                        <RxPencil1 className='icon' />
                        <span>{t('label.edit')}</span>
                    </button>
                </div>
            </section>
        </section>
    )
}
