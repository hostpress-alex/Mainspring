import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'

import { userService } from '../services/user.service'
import { boardService } from '../services/board.service'

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
        return e?.response?.data?.err || e?.message || 'Unbekannter Fehler'
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
            flash(`Benutzer "${form.username}" angelegt.`)
            reload()
        } catch (e) { setErr(readErr(e)) }
    }

    async function onToggleAdmin (user) {
        setErr(null)
        try {
            await userService.setAdmin(user._id, !user.isAdmin)
            flash(`${user.fullname}: Admin-Recht ${user.isAdmin ? 'entzogen' : 'vergeben'}.`)
            reload()
        } catch (e) { setErr(readErr(e)) }
    }

    async function onDeleteUser (user) {
        setErr(null)
        try {
            await userService.remove(user._id)
            flash(`Benutzer "${user.username}" geloescht.`)
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
            flash(`${user.fullname} zu "${board.title}" hinzugefuegt.`)
            reload()
        } catch (e) { setErr(readErr(e)) }
    }

    async function onRemoveMember (board, memberId) {
        setErr(null)
        try {
            const members = (board.members || []).filter(m => String(m._id) !== String(memberId))
            await boardService.setMembers(board._id, members)
            flash('Mitglied entfernt.')
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
            setErr('Ein Board braucht mindestens einen Owner.')
            return
        }
        try {
            const ownerIds = isOwner
                ? owners.filter(id => id !== String(userId))
                : [...owners, String(userId)]
            await boardService.setOwners(board._id, ownerIds)
            const u = users.find(x => String(x._id) === String(userId))
            flash(`${u ? u.fullname : userId}: Owner-Recht fuer "${board.title}" ${isOwner ? 'entzogen' : 'vergeben'}.`)
            reload()
        } catch (e) { setErr(readErr(e)) }
    }

    return (
        <section style={S.page}>
            <h1 style={S.h1}>Administration</h1>
            <p style={S.sub}>
                Angemeldet als {me?.fullname}.
            </p>

            {err && <div style={S.err}>{err}</div>}
            {msg && <div style={S.ok}>{msg}</div>}

            <div style={S.card}>
                <h2 style={S.h2}>Benutzer anlegen</h2>
                <form onSubmit={onCreateUser}>
                    <input style={S.input} placeholder='Voller Name' value={form.fullname}
                        onChange={e => setForm({ ...form, fullname: e.target.value })} required />
                    <input style={S.input} placeholder='Benutzername' value={form.username}
                        onChange={e => setForm({ ...form, username: e.target.value })} required />
                    <input style={S.input} type='password' placeholder='Passwort (min. 8)' value={form.password}
                        onChange={e => setForm({ ...form, password: e.target.value })} required />
                    <label style={{ marginRight: 12, fontSize: 14 }}>
                        <input type='checkbox' checked={form.isAdmin}
                            onChange={e => setForm({ ...form, isAdmin: e.target.checked })} /> Admin
                    </label>
                    <button style={S.btn} type='submit'>Anlegen</button>
                </form>
            </div>

            <div style={S.card}>
                <h2 style={S.h2}>Benutzer ({users.length})</h2>
                <table style={S.table}>
                    <thead>
                        <tr>
                            <th style={S.th}>Name</th>
                            <th style={S.th}>Benutzername</th>
                            <th style={S.th}>Rolle</th>
                            <th style={S.th}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u._id}>
                                <td style={S.td}>{u.fullname}</td>
                                <td style={S.td}>{u.username}</td>
                                <td style={S.td}>{u.isAdmin ? <span style={S.badge}>Admin</span> : 'Benutzer'}</td>
                                <td style={{ ...S.td, textAlign: 'right' }}>
                                    {String(u._id) !== String(me?._id) && <>
                                        <button style={S.btnGhost} onClick={() => onToggleAdmin(u)}>
                                            {u.isAdmin ? 'Admin entziehen' : 'Zum Admin machen'}
                                        </button>
                                        <button style={S.btnDanger} onClick={() => onDeleteUser(u)}>Loeschen</button>
                                    </>}
                                    {String(u._id) === String(me?._id) && <span style={{ color: '#9699a6', fontSize: 13 }}>das bist du</span>}
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
                            <th style={S.th}>Board</th>
                            <th style={S.th}>Mitglieder — ★ = Owner</th>
                            <th style={S.th}>Hinzufuegen</th>
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
                                        {(b.members || []).length === 0 && <span style={{ color: '#9699a6' }}>niemand</span>}
                                        {(b.members || []).map(m => {
                                            const isOwner = owners.includes(String(m._id))
                                            return (
                                                <span key={m._id} style={{ ...S.chip, background: isOwner ? '#e6f2ff' : '#f0f1f5' }}>
                                                    <span style={{ cursor: 'pointer' }}
                                                        title={isOwner ? 'Owner-Recht entziehen' : 'Zum Owner machen'}
                                                        onClick={() => onToggleOwner(b, m._id)}>
                                                        {isOwner ? '★ ' : '☆ '}{m.fullname}
                                                    </span>
                                                    {!isOwner && <span style={S.x} title='Aus Board entfernen'
                                                        onClick={() => onRemoveMember(b, m._id)}>×</span>}
                                                </span>
                                            )
                                        })}
                                    </td>
                                    <td style={S.td}>
                                        <select style={S.input} value='' onChange={e => onAddMember(b, e.target.value)}>
                                            <option value=''>Benutzer waehlen…</option>
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
