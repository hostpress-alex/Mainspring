import {Link, useLocation, useNavigate} from 'react-router-dom'
import {useSelector} from 'react-redux'
import {useState} from 'react'

import { Icon } from '../icon'
import {closeDynamicModal} from '../../store/board.actions'
import WorkspaceIcon from './workspace-icon'
import {Tooltip} from '@mui/material'
import {LogoMark} from '../logo-mark'
import { Avatar } from '../avatar'
import {NotificationBell} from '../notification/notification-bell'
import {SearchPanel} from '../search/search-panel'
import {t} from '../../i18n'
import {RunningTimer} from '../time/running-timer'

/**
 * Left-hand main navigation. Runs in two contexts:
 *  - inside the board view: there the top icons drive the workspace bar
 *    (setWorkspaceDisplay/setIsWorkspaceOpen are passed in)
 *  - in the AppShell on every other page: then those props are missing and the
 *    icons navigate to the board overview instead
 */
export function MainSidebar({setIsLoginModalOpen, setWorkspaceDisplay, setIsWorkspaceOpen}){
    const [display, setDisplay] = useState('board')
    const [isSearchOpen, setIsSearchOpen] = useState(false)
    const user = useSelector(storeState => storeState.userModule.user)
    const location = useLocation()
    const navigate = useNavigate()

    const hasBoardContext = typeof setWorkspaceDisplay === 'function'
    const isOnBoards = location.pathname === '/' || location.pathname.startsWith('/board/')

    function onChooseIcon(icon){
        if(!hasBoardContext){
            // Outside the board view there is no workspace bar to unfold —
            // then the icon leads back to the overview.
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
            <span className="open-workspace-btn">
                <Icon name='bars' onClick={() => setIsWorkspaceOpen && setIsWorkspaceOpen(prev => !prev)}/>
            </span>

            <Link to={'/'} className="icon-link">
                <Tooltip title={t('nav.home')} arrow placement="right">
                    <LogoMark className="home-img" size={26} tone="light" title={t('nav.home')} onClick={closeDynamicModal}/>
                </Tooltip>
            </Link>

            <div className="tools-container flex column align-center">
                <Tooltip title={t('nav.workspaces')} arrow placement="right">
                    <div className="icon-container" onClick={() => onChooseIcon('board')}>
                        <WorkspaceIcon/>
                        {active('board') && <Icon name='caret-left' className="triangle-icon"/>}
                    </div>
                </Tooltip>

                {/* Above the bell rather than below: looking for something is
                    the more common errand, and the bell is where people are
                    used to it being. */}
                <Tooltip title={t('search.title')} arrow placement="right">
                    <div className="icon-container" onClick={() => setIsSearchOpen(true)}>
                        <Icon name='magnifying-glass'/>
                    </div>
                </Tooltip>

                <NotificationBell/>

                <Tooltip title={t('nav.calendar')} arrow placement="right">
                    <Link to="/calendar" className={`icon-container nav-link${location.pathname === '/calendar'?' is-active':''}`}>
                        <Icon name='calendar-days'/>
                        {location.pathname === '/calendar' && <Icon name='caret-left' className="triangle-icon"/>}
                    </Link>
                </Tooltip>

                {user?.isAdmin && (
                    <Tooltip title={t('nav.administration')} arrow placement="right">
                        <Link to="/admin" className={`icon-container nav-link${location.pathname === '/admin'?' is-active':''}`}>
                            <Icon name='user-shield'/>
                            {location.pathname === '/admin' && <Icon name='caret-left' className="triangle-icon"/>}
                        </Link>
                    </Tooltip>
                )}
            </div>

            {isSearchOpen && <SearchPanel onClose={() => setIsSearchOpen(false)}/>}

            <div className="bottom">
                {/* Only visible while something runs — see running-timer.jsx.
                    Above the avatar, because it is the one thing here that is
                    costing time while it is being ignored. */}
                <RunningTimer/>
                <Tooltip title={user?t('nav.profileTooltip', {name: user.fullname}):t('nav.login')} arrow placement="right">
                    <Avatar className="logged-user-img" src={user?.imgUrl} onClick={() => setIsLoginModalOpen && setIsLoginModalOpen(prev => !prev)}/>
                </Tooltip>
            </div>
        </section>
    )
}
