import {useEffect, useState} from 'react'
import {useSelector} from 'react-redux'
import {Link} from 'react-router-dom'

import {userService} from '../services/user.service'
import {boardService} from '../services/board.service'
import {confirmDelete} from '../cmps/confirm-dialog'
import {PriorityAdmin} from '../cmps/admin/priority-admin'
import {TeamAdmin} from '../cmps/admin/team-admin'
import {t} from '../i18n'

const EMPTY_FORM = {fullname: '', username: '', password: '', isAdmin: false}

export function AdminPage(){
    const me = useSelector(storeState => storeState.userModule.user)
    const [users, setUsers] = useState([])
    const [boards, setBoards] = useState([])
    const [form, setForm] = useState(EMPTY_FORM)
    const [msg, setMsg] = useState(null)
    const [err, setErr] = useState(null)

    useEffect(() => {
        reload()
    }, [])

    async function reload(){
        try {
            // With the closed accounts: this is the one page that has to be
            // able to open one again.
            const [u, b] = await Promise.all([
                userService.getUsers({withInactive: true}), boardService.query()])
            setUsers(u)
            setBoards(b)
        } catch(e) {
            setErr(readErr(e))
        }
    }

    function readErr(e){
        return e?.response?.data?.err || e?.message || t('common.unknownError')
    }

    function flash(text){
        setMsg(text);
        setErr(null)
        setTimeout(() => setMsg(null), 3000)
    }

    async function onCreateUser(ev){
        ev.preventDefault()
        setErr(null)
        try {
            await userService.create(form)
            setForm(EMPTY_FORM)
            flash(t('admin.userCreated', {name: form.username}))
            reload()
        } catch(e) {
            setErr(readErr(e))
        }
    }

    async function onToggleAdmin(user){
        setErr(null)
        try {
            await userService.setAdmin(user._id, !user.isAdmin)
            flash(t(user.isAdmin?'admin.adminRevoked':'admin.adminGranted', {name: user.fullname}))
            reload()
        } catch(e) {
            setErr(readErr(e))
        }
    }

    async function onDeleteUser(user){
        const ok = await confirmDelete({
            what: t('admin.deleteUserName', {name: user.fullname || user.username}),
            note: t('admin.deleteUserNote'),
            button: t('admin.deleteUser')
        })
        if(!ok) return
        setErr(null)
        try {
            await userService.remove(user._id)
            flash(t('admin.userDeleted', {name: user.username}))
            reload()
        } catch(e) {
            setErr(readErr(e))
        }
    }

    /** Open a closed account again. No question — nothing is lost either way. */
    async function onSetUserState(user, state){
        setErr(null)
        try {
            await userService.setUserState(user._id, state)
            flash(t('admin.userReactivated', {name: user.username}))
            reload()
        } catch(e) {
            setErr(readErr(e))
        }
    }

    async function onAddMember(board, userId){
        if(!userId) return
        const user = users.find(u => u._id === userId)
        if(!user) return
        setErr(null)
        try {
            const members = [...(board.members || []), {
                _id: user._id,
                fullname: user.fullname,
                imgUrl: user.imgUrl || ''
            }]
            await boardService.setMembers(board._id, members)
            flash(t('admin.memberAdded', {name: user.fullname, board: board.title}))
            reload()
        } catch(e) {
            setErr(readErr(e))
        }
    }

    async function onRemoveMember(board, memberId){
        setErr(null)
        try {
            const members = (board.members || []).filter(m => String(m._id) !== String(memberId))
            await boardService.setMembers(board._id, members)
            flash(t('member.removed'))
            reload()
        } catch(e) {
            setErr(readErr(e))
        }
    }

    function ownerIdsOf(board){
        return boardService.ownerIdsOf(board)
    }

    async function onToggleOwner(board, userId){
        setErr(null)
        const owners = ownerIdsOf(board)
        const isOwner = owners.includes(String(userId))
        if(isOwner && owners.length === 1){
            setErr(t('admin.ownerRequired'))
            return
        }
        try {
            const ownerIds = isOwner
                ?owners.filter(id => id !== String(userId))
                :[...owners, String(userId)]
            await boardService.setOwners(board._id, ownerIds)
            const u = users.find(x => String(x._id) === String(userId))
            flash(t(isOwner?'admin.ownerRevoked':'admin.ownerGranted',
                {name: u?u.fullname:userId, board: board.title}))
            reload()
        } catch(e) {
            setErr(readErr(e))
        }
    }

    return (
        <section className="admin-page">
            <h1 className="admin-title">{t('nav.administration')}</h1>
            <p className="admin-sub">{t('admin.signedInAs', {name: me?.fullname})}</p>

            {err && <div className="admin-error">{err}</div>}
            {msg && <div className="admin-success">{msg}</div>}

            {/* First, because it is the one list on this page that everybody
                on every board sees the moment it changes. */}
            <PriorityAdmin onError={e => setErr(readErr(e))}/>

            {/* After the users are loaded, because it is a row per person. */}
            {users.length > 0 && <TeamAdmin users={users} onError={e => setErr(readErr(e))}/>}

            <div className="admin-card">
                <h2 className="admin-section-title">{t('admin.createUser')}</h2>
                <form onSubmit={onCreateUser}>
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
                                            ?<button className="admin-btn-ghost" onClick={() => onSetUserState(u, 'active')}>
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

            <div className="admin-card">
                <h2 className="admin-section-title">Boards und Zugriff ({boards.length})</h2>
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th className="admin-th">{t('board.board')}</th>
                            <th className="admin-th">{t('admin.members')}</th>
                            <th className="admin-th">{t('common.add')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {boards.map(b => {
                            const memberIds = (b.members || []).map(m => String(m._id))
                            const owners = ownerIdsOf(b)
                            const candidates = users.filter(u => !memberIds.includes(String(u._id)))
                            return (
                                <tr key={b._id}>
                                    <td className="admin-td"><Link to={`/board/${b._id}`}>{b.title}</Link></td>
                                    <td className="admin-td">
                                        {(b.members || []).length === 0 &&
                                            <span className="admin-muted is-plain">{t('common.nobody')}</span>}
                                        {(b.members || []).map(m => {
                                            const isOwner = owners.includes(String(m._id))
                                            return (
                                                <span key={m._id} className={`admin-chip${isOwner?' is-owner':''}`}>
                                                    <span className="admin-chip-toggle" title={isOwner?t('admin.revokeOwner'):t('admin.makeOwner')} onClick={() => onToggleOwner(b, m._id)}>
                                                        {isOwner?'★ ':'☆ '}{m.fullname}
                                                    </span>
                                                    {!isOwner &&
                                                        <span className="admin-remove" title={t('admin.removeFromBoard')} onClick={() => onRemoveMember(b, m._id)}>×</span>}
                                                </span>
                                            )
                                        })}
                                    </td>
                                    <td className="admin-td">
                                        <select className="admin-input" value="" onChange={e => onAddMember(b, e.target.value)}>
                                            <option value="">{t('admin.chooseUser')}</option>
                                            {candidates.map(u =>
                                                <option key={u._id} value={u._id}>{u.fullname}</option>)}
                                        </select>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
                <p className="admin-sub is-footnote">
                    Auf den Namen klicken schaltet das Owner-Recht um (★). Mitglieder sehen und bearbeiten das Board;
                    Owner duerfen zusaetzlich Mitglieder ein- und ausladen, weitere Owner ernennen und das Board loeschen.
                    Ein Board braucht mindestens einen Owner, und Owner koennen nicht als Mitglied entfernt werden.
                    Admins duerfen unabhaengig davon alles. </p>
            </div>
        </section>
    )
}
