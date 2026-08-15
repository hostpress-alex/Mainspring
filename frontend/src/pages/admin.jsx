import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'

import { userService } from '../services/user.service'
import { boardService } from '../services/board.service'
import { confirmDelete } from '../cmps/confirm-dialog'
import { t } from '../i18n'

const S = {
    page: { padding: '32px 40px', maxWidth: 1100, margin: '0 auto', fontFamily: 'inherit' },
    h1: { fontSize: 28, marginBottom: 4 },
    sub: { color: '#676879', marginBottom: 28 },
    card: { background: '#fff', border: '1px solid #d0d4e4', borderRadius: 8, padding: 20, marginBottom: 24 },
    h2: { fontSize: 18, marginBottom: 14 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
    th: { textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e6e9ef', color: '#676879', fontWeight: 500 },
    td: { padding: '8px 10px', borderBottom: '1px solid #f0f1f5', verticalAlign: 'middle' },
    input: { padding: '7px 10px', border: '1px solid #c3c6d4', borderRadius: 4, marginRight: 8, fontSize: 14 },
    btn: { padding: '7px 14px', border: 'none', borderRadius: 4, background: '#0073ea', color: '#fff', cursor: 'pointer', fontSize: 14 },
    btnGhost: { padding: '4px 10px', border: '1px solid #c3c6d4', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 13, marginRight: 6 },
    btnDanger: { padding: '4px 10px', border: '1px solid #e2445c', borderRadius: 4, background: '#fff', color: '#e2445c', cursor: 'pointer', fontSize: 13 },
    badge: { background: '#00c875', color: '#fff', borderRadius: 10, padding: '2px 9px', fontSize: 12 },
    chip: { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f0f1f5', borderRadius: 14, padding: '3px 6px 3px 10px', marginRight: 6, marginBottom: 4, fontSize: 13 },
    x: { cursor: 'pointer', color: '#676879', fontWeight: 700, padding: '0 4px' },
    err: { background: '#fff0f2', border: '1px solid #e2445c', color: '#a3283a', padding: '10px 14px', borderRadius: 4, marginBottom: 16 },
    ok: { background: '#eefaf3', border: '1px solid #00c875', color: '#00734a', padding: '10px 14px', borderRadius: 4, marginBottom: 16 },
}

const EMPTY_FORM = { fullname: '', username: '', password: '', isAdmin: false }

export function AdminPage () {
    const me = useSelector(storeState => storeState.userModule.user)
    const [users, setUsers] = useState([])
    const [boards, setBoards] = useState([])
    const [form, setForm] = useState(EMPTY_FORM)
    const [msg, setMsg] = useState(null)
    const [err, setErr] = useState(null)

    useEffect(() => { reload() }, [])

    async function reload () {
        try {
            const [u, b] = await Promise.all([userService.getUsers(), boardService.query()])
            setUsers(u)
            setBoards(b)
        } catch (e) {
            setErr(readErr(e))
        }
    }

    function readErr (e) {
        return e?.response?.data?.err || e?.message || t('common.unknownError')
    }

    function flash (text) {
        setMsg(text); setErr(null)
        setTimeout(() => setMsg(null), 3000)
    }

    async function onCreateUser (ev) {
        ev.preventDefault()
        setErr(null)
        try {
            await userService.create(form)
            setForm(EMPTY_FORM)
            flash(t('admin.userCreated', { name: form.username }))
            reload()
        } catch (e) { setErr(readErr(e)) }
    }

    async function onToggleAdmin (user) {
        setErr(null)
        try {
            await userService.setAdmin(user._id, !user.isAdmin)
            flash(t(user.isAdmin ? 'admin.adminRevoked' : 'admin.adminGranted', { name: user.fullname }))
            reload()
        } catch (e) { setErr(readErr(e)) }
    }

    async function onDeleteUser (user) {
        const ok = await confirmDelete({
            what: t('admin.deleteUserName', { name: user.fullname || user.username }),
            note: t('admin.deleteUserNote'),
            button: t('admin.deleteUser'),
        })
        if (!ok) return
        setErr(null)
        try {
            await userService.remove(user._id)
            flash(t('admin.userDeleted', { name: user.username }))
            reload()
        } catch (e) { setErr(readErr(e)) }
    }

    async function onAddMember (board, userId) {
        if (!userId) return
        const user = users.find(u => u._id === userId)
        if (!user) return
        setErr(null)
        try {
            const members = [...(board.members || []), { _id: user._id, fullname: user.fullname, imgUrl: user.imgUrl || '' }]
            await boardService.setMembers(board._id, members)
            flash(t('admin.memberAdded', { name: user.fullname, board: board.title }))
            reload()
        } catch (e) { setErr(readErr(e)) }
    }

    async function onRemoveMember (board, memberId) {
        setErr(null)
        try {
            const members = (board.members || []).filter(m => String(m._id) !== String(memberId))
            await boardService.setMembers(board._id, members)
            flash(t('member.removed'))
            reload()
        } catch (e) { setErr(readErr(e)) }
    }

    function ownerIdsOf (board) {
        return boardService.ownerIdsOf(board)
    }

    async function onToggleOwner (board, userId) {
        setErr(null)
        const owners = ownerIdsOf(board)
        const isOwner = owners.includes(String(userId))
        if (isOwner && owners.length === 1) {
            setErr(t('admin.ownerRequired'))
            return
        }
        try {
            const ownerIds = isOwner
                ? owners.filter(id => id !== String(userId))
                : [...owners, String(userId)]
            await boardService.setOwners(board._id, ownerIds)
            const u = users.find(x => String(x._id) === String(userId))
            flash(t(isOwner ? 'admin.ownerRevoked' : 'admin.ownerGranted',
                { name: u ? u.fullname : userId, board: board.title }))
            reload()
        } catch (e) { setErr(readErr(e)) }
    }

    return (
        <section style={S.page}>
            <h1 style={S.h1}>{t('nav.administration')}</h1>
            <p style={S.sub}>
                Angemeldet als {me?.fullname}.
            </p>

            {err && <div style={S.err}>{err}</div>}
            {msg && <div style={S.ok}>{msg}</div>}

            <div style={S.card}>
                <h2 style={S.h2}>{t('admin.createUser')}</h2>
                <form onSubmit={onCreateUser}>
                    <input style={S.input} placeholder={t('profile.fullName')} value={form.fullname}
                        onChange={e => setForm({ ...form, fullname: e.target.value })} required />
                    <input style={S.input} placeholder={t('login.username')} value={form.username}
                        onChange={e => setForm({ ...form, username: e.target.value })} required />
                    <input style={S.input} type='password' placeholder={t('admin.passwordPlaceholder')} value={form.password}
                        onChange={e => setForm({ ...form, password: e.target.value })} required />
                    <label style={{ marginRight: 12, fontSize: 14 }}>
                        <input type='checkbox' checked={form.isAdmin}
                            onChange={e => setForm({ ...form, isAdmin: e.target.checked })} /> {t('admin.admin')}
                    </label>
                    <button style={S.btn} type='submit'>{t('common.create')}</button>
                </form>
            </div>

            <div style={S.card}>
                <h2 style={S.h2}>Benutzer ({users.length})</h2>
                <table style={S.table}>
                    <thead>
                        <tr>
                            <th style={S.th}>{t('common.name')}</th>
                            <th style={S.th}>{t('login.username')}</th>
                            <th style={S.th}>{t('common.role')}</th>
                            <th style={S.th}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u._id}>
                                <td style={S.td}>{u.fullname}</td>
                                <td style={S.td}>{u.username}</td>
                                <td style={S.td}>{u.isAdmin ? <span style={S.badge}>{t('admin.admin')}</span> : t('common.user')}</td>
                                <td style={{ ...S.td, textAlign: 'right' }}>
                                    {String(u._id) !== String(me?._id) && <>
                                        <button style={S.btnGhost} onClick={() => onToggleAdmin(u)}>
                                            {u.isAdmin ? t('admin.revokeAdmin') : t('admin.makeAdmin')}
                                        </button>
                                        <button style={S.btnDanger} onClick={() => onDeleteUser(u)}>{t('common.delete')}</button>
                                    </>}
                                    {String(u._id) === String(me?._id) && <span style={{ color: '#9699a6', fontSize: 13 }}>{t('admin.thatIsYou')}</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={S.card}>
                <h2 style={S.h2}>Boards und Zugriff ({boards.length})</h2>
                <table style={S.table}>
                    <thead>
                        <tr>
                            <th style={S.th}>{t('board.board')}</th>
                            <th style={S.th}>{t('admin.members')}</th>
                            <th style={S.th}>{t('common.add')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {boards.map(b => {
                            const memberIds = (b.members || []).map(m => String(m._id))
                            const owners = ownerIdsOf(b)
                            const candidates = users.filter(u => !memberIds.includes(String(u._id)))
                            return (
                                <tr key={b._id}>
                                    <td style={S.td}><Link to={`/board/${b._id}`}>{b.title}</Link></td>
                                    <td style={S.td}>
                                        {(b.members || []).length === 0 && <span style={{ color: '#9699a6' }}>{t('common.nobody')}</span>}
                                        {(b.members || []).map(m => {
                                            const isOwner = owners.includes(String(m._id))
                                            return (
                                                <span key={m._id} style={{ ...S.chip, background: isOwner ? '#e6f2ff' : '#f0f1f5' }}>
                                                    <span style={{ cursor: 'pointer' }}
                                                        title={isOwner ? t('admin.revokeOwner') : t('admin.makeOwner')}
                                                        onClick={() => onToggleOwner(b, m._id)}>
                                                        {isOwner ? '★ ' : '☆ '}{m.fullname}
                                                    </span>
                                                    {!isOwner && <span style={S.x} title={t('admin.removeFromBoard')}
                                                        onClick={() => onRemoveMember(b, m._id)}>×</span>}
                                                </span>
                                            )
                                        })}
                                    </td>
                                    <td style={S.td}>
                                        <select style={S.input} value='' onChange={e => onAddMember(b, e.target.value)}>
                                            <option value=''>{t('admin.chooseUser')}</option>
                                            {candidates.map(u => <option key={u._id} value={u._id}>{u.fullname}</option>)}
                                        </select>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
                <p style={{ ...S.sub, marginTop: 14, marginBottom: 0, fontSize: 13 }}>
                    Auf den Namen klicken schaltet das Owner-Recht um (★). Mitglieder sehen und bearbeiten das Board;
                    Owner duerfen zusaetzlich Mitglieder ein- und ausladen, weitere Owner ernennen und das Board loeschen.
                    Ein Board braucht mindestens einen Owner, und Owner koennen nicht als Mitglied entfernt werden.
                    Admins duerfen unabhaengig davon alles.
                </p>
            </div>
        </section>
    )
}
