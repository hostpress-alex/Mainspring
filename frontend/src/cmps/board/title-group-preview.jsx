import { useRef } from "react"
import { useSelector } from "react-redux"

import { setDynamicModalObj } from "../../store/board.actions"

import { BiDotsHorizontalRounded } from 'react-icons/bi'

export function TitleGroupPreview({ title, group, isKanban }) {
    const dynamicModalObj = useSelector(storeState => storeState.boardModule.dynamicModalObj)
    const elRemoveColumn = useRef()

    function getTitleName(cmpOrder) {
        // Normalize the component name to handle both formats
        const normalizedCmp = cmpOrder.toLowerCase().replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
        
        switch (normalizedCmp) {
            case 'member-picker':
            case 'memberpicker':
                return 'Person'
            case 'status-picker':
            case 'statuspicker':
                return 'Status'
            case 'date-picker':
            case 'datepicker':
                return 'Date'
            case 'priority-picker':
            case 'prioritypicker':
                return 'Priority'
            case 'number-picker':
            case 'numberpicker':
                return 'Number'
            case 'file-picker':
            case 'filepicker':
                return 'Files'
            case 'updated-picker':
            case 'updatedpicker':
                return 'Last Updated'
            default: return cmpOrder
        }
    }

    function onToggleMenuModal() {
        console.log(elRemoveColumn)
        const isOpen = dynamicModalObj?.group?.id === group.id && dynamicModalObj?.cmpOrder === title && dynamicModalObj?.type === 'remove-column' ? !dynamicModalObj.isOpen : true
        const { x, y } = elRemoveColumn.current.getClientRects()[0]
        setDynamicModalObj({ isOpen, pos: { x: (x - 75), y: (y + 28) }, type: 'remove-column', group: group, cmpOrder: title })
    }

    return (
        <>
            {getTitleName(title)}
            <span ref={elRemoveColumn} className="open-modal-icon">
                {!isKanban && <BiDotsHorizontalRounded onClick={onToggleMenuModal} />}
            </span>
        </>
    )
}