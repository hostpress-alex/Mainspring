import React, {useEffect, useState} from 'react'
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
import {ensureSession} from './store/user.actions'
import {ensureLoaded as ensurePriorities} from './services/priority.store'
import {ConfirmHost} from './cmps/confirm-dialog'
import {UserMsgHost} from './cmps/user-msg'
import {ErrorBoundary} from './cmps/error-boundary'

/**
 * "Nobody is signed in" and "we have not asked yet" are different answers.
 *
 * The store starts out empty on every cold load — a new tab, a middle-clicked
 * board, a restored window. Treating that as signed out is what used to send
 * people to the login form while their cookie was perfectly valid. So: no user
 * in the store means ask the server once, and decide when the answer is in.
 */
function useSession(){
    const user = useSelector(storeState => storeState.userModule.user)
    const [isAsking, setIsAsking] = useState(!user)

    useEffect(() => {
        if(user){
            setIsAsking(false)
            // The global priority list, once per session. Fetched here rather
            // than by the first cell that needs it, because the helpers that
            // read it — the filter, the summary row — are plain functions
            // that cannot wait for a request and would answer "no such
            // priority" until one arrived.
            ensurePriorities()
            return
        }
        let alive = true
        setIsAsking(true)
        ensureSession().finally(() => { if(alive) setIsAsking(false) })
        return () => { alive = false }
    }, [user])

    return {user, isAsking}
}

/**
 * Protects a route. Without a logged-in user it redirects to /auth/login; the
 * path originally asked for travels in location.state, so that you land back
 * there after logging in.
 */
function RequireAuth({children}){
    const {user, isAsking} = useSession()
    const location = useLocation()

    // Nothing, deliberately: a spinner for the few milliseconds this takes
    // reads as a page that is broken, and a flash of the login form reads as
    // being thrown out.
    if(isAsking) return null
    if(!user) return <Navigate to="/auth/login" replace state={{from: location.pathname + location.search}}/>
    return children
}

/** Like RequireAuth, additionally demands the admin flag. */
function RequireAdmin({children}){
    const {user, isAsking} = useSession()
    if(isAsking) return null
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
                {/* And exactly one place where a failure is admitted to.
                    Outside the routes on purpose: a message that disappears
                    because the page changed underneath it has said nothing. */}
                <UserMsgHost/>
            </div>
        </Provider>
    )
}
