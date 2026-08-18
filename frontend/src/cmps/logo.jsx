import {Link} from 'react-router-dom'
import {LogoMark} from './logo-mark'
import {APP_NAME} from '../constants/app'


export default function Logo(){
    return (
        <Link to={'/'} className="logo">
            <LogoMark className="logo-img" size={30} title={APP_NAME}/>
            <h2 className="logo-title">{APP_NAME}</h2>
        </Link>
    )
}
