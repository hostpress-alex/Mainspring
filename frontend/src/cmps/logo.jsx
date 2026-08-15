import {Link} from 'react-router-dom'
import {LogoMark} from './logo-mark'

/**
 * Logo mark with wordmark. The name deliberately sits in exactly one place —
 * here — so a later change does not run through half the application.
 */
export const APP_NAME = 'myday'

export default function Logo(){
    return (
        <Link to={'/'} className="logo">
            <LogoMark className="logo-img" size={30} title={APP_NAME}/>
            <h2 className="logo-title">{APP_NAME}</h2>
        </Link>
    )
}
