import {useSelector} from 'react-redux'
import {useEffect, useState} from 'react'

import {loadBoards} from '../../store/board.actions'
import {boardService} from '../../services/board.service'

import { Icon } from '../icon'
import WorkspaceBoard from './workspace/workspace-board'
import {useCallback} from 'react'
import {Tooltip} from '@mui/material'
import {t} from '../../i18n'

export function WorkspaceSidebar({
    workspaceDisplay,
    setIsCreateModalOpen,
    setIsWorkspaceOpen,
    isWorkspaceOpen,
    setWorkspaceDisplay
}){
    const [filterByToEdit, setFilterByToEdit] = useState(boardService.getDefaultFilterBoards())
    const boards = useSelector(storeState => storeState.boardModule.boards)

    useEffect(() => {
        loadBoards(filterByToEdit)
    }, [filterByToEdit])

    function onToggleWorkspace(){
        setIsWorkspaceOpen((prevIsOpen) => !prevIsOpen)
    }

    const handleChange = useCallback(({target}) => {
        let {value, name: field} = target
        setFilterByToEdit((prevFilter) => ({...prevFilter, [field]: value}))
    }, [])

    return (
        <section className={`workspace-sidebar ${isWorkspaceOpen?'open':'close'}`}>
            <Tooltip title={isWorkspaceOpen?t('nav.collapse'):t('nav.expand')} arrow>
                <div onClick={onToggleWorkspace} className="toggle-workspace ">
                    {isWorkspaceOpen && <Icon name='chevron-left'/>}
                    {!isWorkspaceOpen && <Icon name='chevron-right'/>}
                </div>
            </Tooltip>
            <WorkspaceBoard handleChange={handleChange} filterByToEdit={filterByToEdit} boards={boards} setIsCreateModalOpen={setIsCreateModalOpen}/>
        </section>
    )
}
