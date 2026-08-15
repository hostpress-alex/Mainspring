import { useSelector } from "react-redux"
import { Link } from "react-router-dom"
import { logout } from "../../store/user.actions"
import { BiLogIn } from 'react-icons/bi'
import { TbLogout } from 'react-icons/tb'
import { closeDynamicModal } from "../../store/board.actions"
import { t } from '../../i18n'

export function LoginLogoutModal({ setIsLoginModalOpen }) {
    const user = useSelector(storeState => storeState.userModule.user)

    function onLogout() {
        setIsLoginModalOpen(false)
        closeDynamicModal()
        logout()
    }

    return <section className="login-logout-modal">
        {user && <Link to={'/profil'}><span onClick={closeDynamicModal}>{t('nav.profile')}</span></Link>}
        {user && <span onClick={onLogout} ><TbLogout className="logout-icon" />{t('nav.logout')}</span>}
        {!user && <Link to={'/auth/login'} ><span onClick={closeDynamicModal}>{t('nav.login')}<BiLogIn className="login-icon" /></span></Link>}
    </section>
}