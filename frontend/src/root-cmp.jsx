import React from 'react'
import {Routes, Route, Navigate, useLocation} from 'react-router'
import {Provider, useSelector} from 'react-redux'
import {BoardDetails} from './pages/board-details'
import {BoardsOverview} from './pages/boards-overview'
import {LoginSignup} from './pages/login-signup'
import {AdminPage} from './pages/admin'
import {ProfilePage} from './pages/profile'
import {CalendarPage} from './pages/calendar'
import {AppShell} from './cmps/sidebar/app-shell'
import {store} from './store/store'
import {ConfirmHost} from './cmps/confirm-dialog'
import {ErrorBoundary} from './cmps/error-boundary'

/**
 * Protects a route. Without a logged-in user it redirects to /auth/login; the
 * path originally asked for travels in location.state, so that you land back
 * there after logging in.
 */
function RequireAuth({children}){
    const user = useSelector(storeState => storeState.userModule.user)
    const location = useLocation()

    if(!user) return <Navigate to="/auth/login" replace state={{from: location.pathname + location.search}}/>
    return children
}

/** Like RequireAuth, additionally demands the admin flag. */
function RequireAdmin({children}){
    const user = useSelector(storeState => storeState.userModule.user)
    if(!user) return <Navigate to="/auth/login" replace/>
    if(!user.isAdmin) return <Navigate to="/" replace/>
    return children
}

export function RootCmp(){
    return (
        <Provider store={store}>
            <div>
                <main>
                    {/* The last net. Anything that throws while rendering used
                        to tear down the whole tree and leave a white page with
                        no clue on it — the single worst failure mode this app
                        has, because it looks identical whatever went wrong. */}
                    <ErrorBoundary>
                    <Routes>
                        <Route path="/auth/login" element={<LoginSignup/>}/>
                        <Route path="/auth/signup" element={<LoginSignup/>}/>

                        <Route path="/" element={<RequireAuth><AppShell><BoardsOverview/></AppShell></RequireAuth>}/>
                        <Route path="/board/:boardId/" element={<RequireAuth><BoardDetails/></RequireAuth>}/>
                        <Route path="/board/:boardId/:groupId/:taskId" element={
                            <RequireAuth><BoardDetails/></RequireAuth>}/>
                        <Route path="/board/:boardId/:activityLog" element={
                            <RequireAuth><BoardDetails/></RequireAuth>}/>

                        <Route path="/calendar" element={
                            <RequireAuth><AppShell><CalendarPage/></AppShell></RequireAuth>}/>
                        <Route path="/profile" element={<RequireAuth><AppShell><ProfilePage/></AppShell></RequireAuth>}/>

                        {/* The paths used to be German. Everything a developer
                            types is English, but a bookmark from before the
                            rename should still work — hence the two redirects
                            rather than a silent break. */}
                        <Route path="/kalender" element={<Navigate to="/calendar" replace/>}/>
                        <Route path="/profil" element={<Navigate to="/profile" replace/>}/>
                        <Route path="/admin" element={<RequireAdmin><AppShell><AdminPage/></AppShell></RequireAdmin>}/>

                        <Route path="*" element={<Navigate to="/" replace/>}/>
                    </Routes>
                    </ErrorBoundary>
                </main>
                {/* Exactly one confirmation dialog for the whole application. */}
                <ConfirmHost/>
            </div>
        </Provider>
    )
}
