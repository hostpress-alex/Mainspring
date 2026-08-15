import React, { useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { ColorPalette } from '../color-palette'
import { GroupMenuModal } from './group-menu-modal'
import { RemoveColumnModal } from './remove-column-modal'
import { TaskMenuModal } from './task-menu-modal'
import { ModalMember } from './modal-member'
import { ModalStatusPriority } from './modal-status-priority'
import { AddGroupModal } from './add-group-modal'
import { MemberFilterModal } from './member-filter-modal'
import { ChartTypeModal } from './chart-type-modal'
import { BoardMenuModal } from './board-menu-modal'
import { closeDynamicModal, noteDynamicModalClosedByOutsideClick } from '../../store/board.actions'

export function DynamicModal () {
    const dynamicModalObj = useSelector(storeState => storeState.boardModule.dynamicModalObj)
    const elModal = useRef()

    /**
     * Schliessen per Klick irgendwo ausserhalb — und per Escape.
     * Klickt man auf den Button, der das Popup geoeffnet hat, wuerde dessen
     * onClick es direkt wieder aufmachen; das faengt der Schutz in
     * setDynamicModalObj ab (gleiche Kennung innerhalb von 400 ms).
     */
    useEffect(() => {
        if (!dynamicModalObj?.isOpen) return

        function onPointerDown (ev) {
            if (elModal.current && elModal.current.contains(ev.target)) return
            noteDynamicModalClosedByOutsideClick()
            closeDynamicModal()
        }
        function onKeyDown (ev) {
            if (ev.key === 'Escape') closeDynamicModal()
        }

        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true)
            document.removeEventListener('keydown', onKeyDown)
        }
    }, [dynamicModalObj?.isOpen, dynamicModalObj?.type])

    function getDynamicModalByType (type) {
        switch (type) {
            case 'menu-group':     return <GroupMenuModal dynamicModalObj={dynamicModalObj} />
            case 'palette-modal':  return <ColorPalette dynamicModalObj={dynamicModalObj} />
            case 'remove-column':  return <RemoveColumnModal dynamicModalObj={dynamicModalObj} />
            case 'menu-task':      return <TaskMenuModal dynamicModalObj={dynamicModalObj} />
            case 'member-modal':   return <ModalMember dynamicModalObj={dynamicModalObj} />
            case 'status':
            case 'priority':       return <ModalStatusPriority dynamicModalObj={dynamicModalObj} />
            case 'add-group':      return <AddGroupModal dynamicModalObj={dynamicModalObj} />
            case 'member-filter':  return <MemberFilterModal dynamicModalObj={dynamicModalObj} />
            case 'chart-type':     return <ChartTypeModal dynamicModalObj={dynamicModalObj} />
            case 'board-menu':     return <BoardMenuModal dynamicModalObj={dynamicModalObj} />
            default: return null
        }
    }

    if (!dynamicModalObj?.isOpen) return null

    return (
        <div ref={elModal} className="dynamic-modal"
            style={{ left: dynamicModalObj.pos?.x, top: dynamicModalObj.pos?.y }}>
            {getDynamicModalByType(dynamicModalObj.type)}
        </div>
    )
}
