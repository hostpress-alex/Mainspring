import {useEffect, useState} from 'react'
import {MainSidebar} from './main-sidebar'
import {WorkspaceSidebar} from './workspace-sidebar'
import {LoginLogoutModal} from '../modal/login-logout-modal'
import {CreateBoard} from '../modal/create-board'
import {DynamicModal} from '../modal/dynamic-modal'

/**
 * Frame for all pages outside the board view: main bar, below it the board
 * column, content on the right. That way you see the same board list
 * everywhere as you do inside a board.
 *
 * The board view itself already brings both bars and therefore does not run
 * through this shell.
 */
export function AppShell({children, showBoards = true}){
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(
        () => localStorage.getItem('workspaceOpen') !== 'false'
    )

    useEffect(() => {
        localStorage.setItem('workspaceOpen', String(isWorkspaceOpen))
    }, [isWorkspaceOpen])

    return (
        <div className="app-shell">
            <div className="app-shell-nav flex">
                <MainSidebar setIsLoginModalOpen={setIsLoginModalOpen}/>
                {showBoards && (
                    <WorkspaceSidebar isWorkspaceOpen={isWorkspaceOpen} setIsWorkspaceOpen={setIsWorkspaceOpen} setIsCreateModalOpen={setIsCreateModalOpen}/>
                )}
            </div>

            {isLoginModalOpen && (
                <div className="app-shell-corner">
                    <LoginLogoutModal setIsLoginModalOpen={setIsLoginModalOpen}/>
                </div>
            )}
            {isCreateModalOpen && <CreateBoard setIsModalOpen={setIsCreateModalOpen}/>}

            <div className="app-shell-content">{children}</div>
            <DynamicModal/>
        </div>
    )
}
