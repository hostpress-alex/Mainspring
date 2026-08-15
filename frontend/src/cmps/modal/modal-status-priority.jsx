import { useState } from 'react'
import { useSelector } from 'react-redux'

import { setDynamicModalObj, closeDynamicModal, saveColumnLabels } from '../../store/board.actions'
import { LabelEditor } from './label-editor'
import { RxPencil1 } from 'react-icons/rx'
import { VscTriangleUp } from 'react-icons/vsc'

/**
 * Auswahl fuer Status- und Prioritaets-Spalten.
 *
 * Die Liste gehoert seit der Umstellung zur SPALTE (column.labels), nicht mehr
 * zum Board. board.labels bleibt nur als Rueckfall fuer Boards, die noch nie
 * gelesen wurden.
 *
 * Der Editor wird bewusst OHNE die Klassen .modal-status-priority(-content)
 * gerendert: deren Regeln geben jedem li eine feste Hoehe von 32px und weisse
 * Schrift — gedacht fuer die bunten Auswahlkacheln, toedlich fuer ein Formular.
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
            setErr(e?.response?.data?.err || 'Labels konnten nicht gespeichert werden.')
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
                    {labels.map((label, idx) => <li onClick={() => onClickModal(label.title)} key={label.id || idx} style={{ backgroundColor: label.color }}>
                        {label.title}
                    </li>)}
                </ul>
                <div className="edit-labels-btn">
                    <button type="button"
                        title={column ? 'Labels dieser Spalte bearbeiten' : 'Für diese Spalte nicht verfügbar'}
                        disabled={!column}
                        onClick={() => setIsEditOpen(true)}>
                        <RxPencil1 className='icon' />
                        <span>Labels bearbeiten</span>
                    </button>
                </div>
            </section>
        </section>
    )
}
