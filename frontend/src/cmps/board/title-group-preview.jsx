import {useEffect, useRef, useState} from 'react'
import {useSelector} from 'react-redux'

import {setDynamicModalObj} from '../../store/board.actions'

import {BiDotsHorizontalRounded} from 'react-icons/bi'
import {t} from '../../i18n'

/**
 * Column header. A double-click renames the column — title and type have been
 * separate since the column rework, so a board can have several "text" columns
 * with names of their own.
 */
export function TitleGroupPreview({column, group, isKanban, onRename}){
    const dynamicModalObj = useSelector(storeState => storeState.boardModule.dynamicModalObj)
    const elRemoveColumn = useRef()
    const [isEditing, setIsEditing] = useState(false)
    const [draft, setDraft] = useState(column?.title || '')

    useEffect(() => {
        if(!isEditing) setDraft(column?.title || '')
    }, [column?.title, isEditing])

    function onToggleMenuModal(){
        const isOpen = dynamicModalObj?.group?.id === group.id
        && dynamicModalObj?.columnId === column.id
        && dynamicModalObj?.type === 'remove-column'?!dynamicModalObj.isOpen:true
        const {x, y} = elRemoveColumn.current.getClientRects()[0]
        setDynamicModalObj({
            isOpen, pos: {x: (x - 75), y: (y + 28)},
            type: 'remove-column', group, columnId: column.id, column
        })
    }

    function commit(){
        setIsEditing(false)
        const clean = draft.trim()
        if(clean && clean !== column.title && onRename) onRename(column, clean)
    }

    if(isEditing){
        return (
            <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => {
                if(e.key === 'Enter') e.currentTarget.blur()
                if(e.key === 'Escape'){
                    setDraft(column.title);
                    setIsEditing(false)
                }
            }} onClick={e => e.stopPropagation()} className="column-title-input"/>
        )
    }

    return (
        <>
            <span onDoubleClick={() => !isKanban && setIsEditing(true)} title={isKanban?column.title:t('column.renameHint')}>
                {column.title}
            </span>
            <span ref={elRemoveColumn} className="open-modal-icon">
                {!isKanban && <BiDotsHorizontalRounded onClick={onToggleMenuModal}/>}
            </span>
        </>
    )
}
