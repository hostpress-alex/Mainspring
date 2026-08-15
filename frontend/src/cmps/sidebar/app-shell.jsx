import { useEffect, useState } from 'react'
import { MainSidebar } from './main-sidebar'
import { WorkspaceSidebar } from './workspace-sidebar'
import { LoginLogoutModal } from '../modal/login-logout-modal'
import { CreateBoard } from '../modal/create-board'
import { DynamicModal } from '../modal/dynamic-modal'
import './app-shell.css'

/**
 * Rahmen fuer alle Seiten ausserhalb der Board-Ansicht: Hauptleiste, darunter
 * die Board-Spalte, rechts der Inhalt. Dadurch sieht man ueberall dieselbe
 * Board-Liste wie innerhalb eines Boards.
 *
 * Die Board-Ansicht selbst bringt beide Leisten schon mit und laeuft deshalb
 * nicht durch diese Huelle.
 */
export function AppShell ({ children, showBoards = true }) {
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
    const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(
        () => localStorage.getItem('workspaceOpen') !== 'false'
    )

    useEffect(() => {
        localStorage.setItem('workspaceOpen', String(isWorkspaceOpen))
    }, [isWorkspaceOpen])

    return (
        <div className='app-shell'>
            <div className='app-shell-nav flex'>
                <MainSidebar setIsLoginModalOpen={setIsLoginModalOpen} />
                {showBoards && (
                    <WorkspaceSidebar
                        isWorkspaceOpen={isWorkspaceOpen}
                        setIsWorkspaceOpen={setIsWorkspaceOpen}
                        setIsCreateModalOpen={setIsCreateModalOpen} />
                )}
            </div>

            {isLoginModalOpen && (
                <div style={{ position: 'fixed', left: 70, bottom: 16, zIndex: 900 }}>
                    <LoginLogoutModal setIsLoginModalOpen={setIsLoginModalOpen} />
                </div>
            )}
            {isCreateModalOpen && <CreateBoard setIsModalOpen={setIsCreateModalOpen} />}

            <div className='app-shell-content'>{children}</div>
            <DynamicModal />
        </div>
    )
}
