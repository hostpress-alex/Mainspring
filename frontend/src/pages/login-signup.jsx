import axios from 'axios'
import {useState, useEffect} from 'react'
import {ImgUploader} from '../cmps/login/img-uploader'
import {LoginPageHeader} from '../cmps/login/login-page-header'
import {Link, useNavigate, useLocation} from 'react-router-dom'
import {useSelector} from 'react-redux'
import {loadUsers, login, signup} from '../store/user.actions'
import {loadBoards} from '../store/board.actions'
import {useGoogleLogin} from '@react-oauth/google'
import {t} from '../i18n'

export function LoginSignup(){
    const [credentials, setCredentials] = useState({username: '', password: '', fullname: ''})
    const [googleUser, setGoogleUser] = useState(null)
    const [isSignup, setIsSignup] = useState(false)
    const [err, setErr] = useState(null)
    const navigate = useNavigate()
    const location = useLocation()
    const from = location.state?.from
    const boards = useSelector(storeState => storeState.boardModule.boards)
    const users = useSelector(storeState => storeState.userModule.users)

    const googleLogin = useGoogleLogin({
        onSuccess: codeResponse => {
            setGoogleUser(codeResponse)
        },
        onError: errorResponse => console.log(errorResponse)
    })

    useEffect(() => {
        // Before login /api/user and /api/board are protected — load nothing here.
        onGoogleLogin()
    }, [googleUser])

    function handleChange(ev){
        const field = ev.target.name
        const value = ev.target.value
        setCredentials({...credentials, [field]: value})
    }

    /**
     * Turn a failed attempt into something the user can act on.
     *
     * The interesting case is the rate limit: once someone is blocked, the
     * correct password does not get them in either, because the limit is
     * checked before the password. Without a message that is indistinguishable
     * from a broken button.
     */
    function readError(error, wasSignup){
        const response = error?.response
        const body = response?.data || {}
        if(response?.status === 429 || body.code === 'TOO_MANY_ATTEMPTS'){
            const minutes = Math.max(1, Math.ceil(Number(body.retryAfter || 0) / 60))
            return t('errors.tooManyAttempts', {n: minutes})
        }
        // The server's own wording is German prose and lives outside i18n —
        // useful in the console, not in the interface. See HANDOVER.md §6.
        if(body.err) console.warn('server said:', body.err)
        return wasSignup?t('errors.signupFailed'):t('errors.loginFailed')
    }

    async function onSubmit(ev, isSignup){
        ev.preventDefault()
        setErr(null)
        if(!credentials.username || !credentials.password) return
        try {
            if(isSignup){
                if(!credentials.fullname) return
                await signup(credentials)
            } else {
                await login(credentials)
            }
        } catch(error) {
            setErr(readError(error, isSignup))
            return
        }
        // boards can still be empty on submit -> boards[0]._id used to throw here
        navigate(from || '/', {replace: true})
    }

    function toggleSignup(){
        setErr(null)
        setIsSignup(!isSignup)
    }

    function onUploaded(imgUrl){
        setCredentials({...credentials, imgUrl})
    }

    async function onGoogleLogin(){
        try {
            if(googleUser){
                const user = await axios.get(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${googleUser.access_token}`, {
                    headers: {
                        Authorization: `Bearer ${googleUser.access_token}`,
                        Accept: 'application/json'
                    }
                })
                checkGoogleCredentials(user.data)
            }
        } catch(error) {
            console.log(error)
        }
    }

    function checkGoogleCredentials(credentials){
        const user = users.find(currUser => currUser.fullname === credentials.name && currUser.username === credentials.email)
        if(user) login(user)
        else {
            signup({
                username: credentials.email,
                password: credentials.id,
                fullname: credentials.name,
                imgUrl: credentials.picture
            })
        }
        navigate(from || '/', {replace: true})
    }

    return (
        // TODO: Change header to the original header(option)
        // TODO: Change label to p
        // TODO: fix image uplouder 
        <div className="login-signup">
            <LoginPageHeader/>
            <form className="form-container layout" onSubmit={(ev) => onSubmit(ev, isSignup)}>
                <h1>{isSignup?t('login.titleSignup'):t('login.titleLogin')}</h1>
                {isSignup && <ImgUploader onUploaded={onUploaded}/>}
                {!isSignup && <p className="login-explain">{t('login.hintLogin')}</p>}
                {isSignup && <p className="login-explain">{t('login.hintSignup')}</p>}
                {err && <p className="login-error" role="alert">{err}</p>}
                {isSignup &&
                    <input type="text" name="fullname" value={credentials.fullname} placeholder={t('login.fullName')} onChange={handleChange} required autoFocus/>}
                <input type="text" name="username" value={credentials.username} placeholder={t('login.username')} onChange={handleChange} required autoFocus/>
                {
                    <input type="password" name="password" value={credentials.password} placeholder={t('login.password')} onChange={handleChange} required/>
                }
                <button className="btn-next">{isSignup?t('login.signup'):t('nav.login')}</button>
                <div className="flex justify-center align-center split-line">
                    <span className="separator-line"></span>
                    <p>{isSignup?t('login.orSignupWith'):t('login.orLoginWith')}</p>
                    <span className="separator-line"></span>
                </div>
                <button className="btn-login-google" onClick={() => googleLogin()}>
                    {/* This used to be loaded from cdn.monday.com — a call to the outside
                        that simply goes nowhere on a network without internet access. */}
                    <svg className="img-google-login" width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                        <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.3 6.6v5.500000000000001h7c4.1-3.8 6.6-9.4 6.6-16.1z"/>
                        <path fill="#34A853" d="M24 46c5.8 0 10.7-1.9 14.3-5.2l-7-5.4c-1.9 1.3-4.4 2.1-7.3 2.1-5.6 0-10.4-3.8-12.1-8.9H4.7v5.6C8.3 41.4 15.6 46 24 46z"/>
                        <path fill="#FBBC05" d="M11.9 28.6c-.4-1.3-.7-2.7-.7-4.1s.2-2.8.7-4.1v-5.6H4.7C3.2 17.7 2.4 20.8 2.4 24s.8 6.3 2.3 9.2l7.2-4.6z"/>
                        <path fill="#EA4335" d="M24 11.4c3.2 0 6 1.1 8.2 3.2l6.2-6.2C34.7 4.9 29.8 2.9 24 2.9 15.6 2.9 8.3 7.5 4.7 14.8l7.2 5.6c1.7-5.1 6.5-9 12.1-9z"/>
                    </svg>
                    <span>Google</span>
                </button>
                <div className="suggest-signup">
                    <span className="suggest-signup-prefix">{isSignup?t('login.haveAccount'):t('login.noAccount')}</span>
                    {!isSignup && <Link to={'/auth/signup'}>
                        <button className="btn-signup" onClick={toggleSignup}>{t('login.signup')}</button>
                    </Link>}
                    {isSignup && <Link to={'/auth/login'}>
                        <button className="btn-signup" onClick={toggleSignup}>{t('nav.login')}</button>
                    </Link>}
                </div>
            </form>
        </div>
    )
}
