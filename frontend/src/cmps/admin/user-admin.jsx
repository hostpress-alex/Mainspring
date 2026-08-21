import {useState} from 'react'
import {useSelector} from 'react-redux'

import {userService} from '../../services/user.service'
import {confirmDelete} from '../confirm-dialog'
import {t} from '../../i18n'

const EMPTY_FORM = {fullname: '', username: '', password: '', isAdmin: false}

/**
 * Everything about people: creating one, and the list of them.
 *
 * Lifted out of pages/admin.jsx when that page grew tabs. The handlers came
 * with it rather than staying behind as seven props — a component that is
 * handed `onToggleAdmin`, `onDeleteUser`, `onSetUserState` and `onCreateUser`
 * is not being reused, it is being remote-controlled, and the page ends up
 * knowing the details of a panel it only has to place.
 *
 * `onChanged` is the one thing it does report: the page holds the user list
 * because two other tabs need it as well.
 */
export function UserAdmin({users, onChanged, onError, onFlash}){
    const me = useSelector(storeState => storeState.userModule.user)
    const [form, setForm] = useState(EMPTY_FORM)

    /** Every write in here looks the same: try, say what happened, reload. */
    async function run(action, success){
        onError(null)
        try {
            await action()
            if(success) onFlash(success)
            onChanged()
        } catch(err) {
            onError(err)
        }
    }

    async function onCreateUser(ev){
        ev.preventDefault()
        const name = form.username
        await run(async () => {
            await userService.create(form)
            setForm(EMPTY_FORM)
        }, t('admin.userCreated', {name}))
    }

    const onToggleAdmin = user => run(
        () => userService.setAdmin(user._id, !user.isAdmin),
        t(user.isAdmin?'admin.adminRevoked':'admin.adminGranted', {name: user.fullname}))

    async function onDeleteUser(user){
        const ok = await confirmDelete({
            what: t('admin.deleteUserName', {name: user.fullname || user.username}),
            note: t('admin.deleteUserNote'),
            button: t('admin.deleteUser')
        })
        if(!ok) return
        await run(() => userService.remove(user._id), t('admin.userDeleted', {name: user.username}))
    }

    /** Open a closed account again. No question — nothing is lost either way. */
    const onReactivate = user => run(
        () => userService.setUserState(user._id, 'active'),
        t('admin.userReactivated', {name: user.username}))

    return (
        <>
            <div className="admin-card">
                <h2 className="admin-section-title">{t('admin.createUser')}</h2>
                <form className="admin-form" onSubmit={onCreateUser}>
                    <input className="admin-input" placeholder={t('profile.fullName')} value={form.fullname} onChange={e => setForm({
                        ...form,
                        fullname: e.target.value
                    })} required/>
                    <input className="admin-input" placeholder={t('login.username')} value={form.username} onChange={e => setForm({
                        ...form,
                        username: e.target.value
                    })} required/>
                    <input className="admin-input" type="password" placeholder={t('admin.passwordPlaceholder')} value={form.password} onChange={e => setForm({
                        ...form,
                        password: e.target.value
                    })} required/>
                    <label className="admin-checkbox">
                        <input type="checkbox" checked={form.isAdmin} onChange={e => setForm({
                            ...form,
                            isAdmin: e.target.checked
                        })}/> {t('admin.admin')}
                    </label>
                    <button className="admin-btn" type="submit">{t('common.create')}</button>
                </form>
            </div>

            <div className="admin-card">
                <h2 className="admin-section-title">{t('admin.usersHeading', {n: users.length})}</h2>
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th className="admin-th">{t('common.name')}</th>
                            <th className="admin-th">{t('login.username')}</th>
                            <th className="admin-th">{t('common.role')}</th>
                            <th className="admin-th"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u._id}>
                                <td className="admin-td">{u.fullname}</td>
                                <td className="admin-td">{u.username}</td>
                                <td className="admin-td">{u.isAdmin?
                                    <span className="admin-badge">{t('admin.admin')}</span>:t('common.user')}
                                    {u.state === 'inactive' &&
                                        <span className="admin-badge is-off">{t('admin.inactive')}</span>}</td>
                                <td className="admin-td is-right">
                                    {String(u._id) !== String(me?._id) && <>
                                        <button className="admin-btn-ghost" onClick={() => onToggleAdmin(u)}>
                                            {u.isAdmin?t('admin.revokeAdmin'):t('admin.makeAdmin')}
                                        </button>
                                        {u.state === 'inactive'
                                            ?<button className="admin-btn-ghost" onClick={() => onReactivate(u)}>
                                                {t('admin.reactivate')}
                                            </button>
                                            :<button className="admin-btn-danger" onClick={() => onDeleteUser(u)}>
                                                {t('admin.deactivate')}
                                            </button>}
                                    </>}
                                    {String(u._id) === String(me?._id) &&
                                        <span className="admin-muted">{t('admin.thatIsYou')}</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    )
}
