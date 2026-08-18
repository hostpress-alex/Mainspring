import {useState} from 'react'
import {ImgUploader} from '../cmps/login/img-uploader'
import {LoginPageHeader} from '../cmps/login/login-page-header'
import {login, signup} from '../store/user.actions'
import {Link, useNavigate, useLocation} from 'react-router-dom'
import {rememberLanguage, t} from '../i18n'

export function LoginSignup(){
    const [credentials, setCredentials] = useState({username: '', password: '', fullname: ''})
    const [isSignup, setIsSignup] = useState(false)
    const [err, setErr] = useState(null)
    const navigate = useNavigate()
    const location = useLocation()
    const from = location.state?.from

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
        let user
        try {
            if(isSignup){
                if(!credentials.fullname) return
                user = await signup(credentials)
            } else {
                user = await login(credentials)
            }
        } catch(error) {
            setErr(readError(error, isSignup))
            return
        }
        // boards can still be empty on submit -> boards[0]._id used to throw here
        const target = from || '/'
        // An account whose language is not the one this browser was last used
        // in needs the app built again, not a route change: every string was
        // read when the modules were imported. Rare, and worth a full load.
        if(rememberLanguage(user?.language)) window.location.assign(target)
        else navigate(target, {replace: true})
    }

    function toggleSignup(){
        setErr(null)
        setIsSignup(!isSignup)
    }

    function onUploaded(imgUrl){
        setCredentials({...credentials, imgUrl})
    }

    return (
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
