import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { useState } from 'react'

import { AiOutlineMenu } from 'react-icons/ai'
import { VscTriangleLeft } from 'react-icons/vsc'
import { MdCalendarMonth, MdOutlineAdminPanelSettings } from 'react-icons/md'
import { closeDynamicModal } from '../../store/board.actions'
import WorkspaceIcon from './workspace-icon'
import { Tooltip } from '@mui/material'
import { LogoMark } from '../logo-mark'
import { GUEST_IMG } from '../../services/avatar'

/**
 * Linke Hauptnavigation. Laeuft in zwei Zusammenhaengen:
 *  - innerhalb der Board-Ansicht: dort steuern die oberen Symbole die
 *    Workspace-Leiste (setWorkspaceDisplay/setIsWorkspaceOpen werden gereicht)
 *  - in der AppShell auf allen anderen Seiten: dann fehlen diese Props und die
 *    Symbole navigieren stattdessen zur Boarduebersicht
 */
export function MainSidebar ({ setIsLoginModalOpen, setWorkspaceDisplay, setIsWorkspaceOpen }) {
    const [display, setDisplay] = useState('board')
    const user = useSelector(storeState => storeState.userModule.user)
    const location = useLocation()
    const navigate = useNavigate()

    const hasBoardContext = typeof setWorkspaceDisplay === 'function'
    const isOnBoards = location.pathname === '/' || location.pathname.startsWith('/board/')

    function onChooseIcon (icon) {
        if (!hasBoardContext) {
            // Ausserhalb der Board-Ansicht gibt es keine Workspace-Leiste zum
            // Aufklappen — dann fuehrt das Symbol zurueck zur Uebersicht.
            navigate('/')
            return
        }
        setDisplay(icon)
        setWorkspaceDisplay(icon)
        setIsWorkspaceOpen(true)
    }

    const active = key => hasBoardContext && display === key && isOnBoards

    return (
        <section className="main-sidebar flex">
            <span className='open-workspace-btn'>
                <AiOutlineMenu onClick={() => setIsWorkspaceOpen && setIsWorkspaceOpen(prev => !prev)} />
            </span>

            <Link to={'/'} className='icon-link'>
                <Tooltip title="Startseite" arrow placement="right">
                    <LogoMark className='home-img' size={26} tone="light" title="Startseite"
                        onClick={closeDynamicModal} />
                </Tooltip>
            </Link>

            <div className='tools-container flex column align-center'>
                <Tooltip title="Workspaces" arrow placement="right">
                    <div className="icon-container" onClick={() => onChooseIcon('board')}>
                        <WorkspaceIcon />
                        {active('board') && <VscTriangleLeft className="triangle-icon" />}
                    </div>
                </Tooltip>

                <Tooltip title="Kalender" arrow placement="right">
                    <Link to='/kalender' className='icon-container'
                        style={{ color: '#fff', opacity: location.pathname === '/kalender' ? 1 : .75 }}>
                        <MdCalendarMonth />
                        {location.pathname === '/kalender' && <VscTriangleLeft className="triangle-icon" />}
                    </Link>
                </Tooltip>

                {user?.isAdmin && (
                    <Tooltip title="Administration" arrow placement="right">
                        <Link to='/admin' className='icon-container'
                            style={{ color: '#fff', opacity: location.pathname === '/admin' ? 1 : .75 }}>
                            <MdOutlineAdminPanelSettings />
                            {location.pathname === '/admin' && <VscTriangleLeft className="triangle-icon" />}
                        </Link>
                    </Tooltip>
                )}
            </div>

            <div className='bottom'>
                <Tooltip title={user ? `${user.fullname} — Profil und Abmelden` : 'Anmelden'} arrow placement="right">
                    <img className='logged-user-img' src={(user && user.imgUrl) ? user.imgUrl : GUEST_IMG} alt=""
                        onClick={() => setIsLoginModalOpen && setIsLoginModalOpen(prev => !prev)} />
                </Tooltip>
            </div>
        </section>
    )
}
