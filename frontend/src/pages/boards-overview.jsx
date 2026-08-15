import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate, Link } from 'react-router-dom'

import { loadBoards, saveBoard } from '../store/board.actions'
import { boardService } from '../services/board.service'
import { logout } from '../store/user.actions'
import { Loader } from '../cmps/loader'
import { GUEST_IMG } from '../services/avatar'

const S = {
    page: { minHeight: '100vh', background: '#f6f7fb' },
    bar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 32px', background: '#fff', borderBottom: '1px solid #e6e9ef' },
    barRight: { display: 'flex', alignItems: 'center', gap: 16, fontSize: 14 },
    main: { maxWidth: 1180, margin: '0 auto', padding: '32px 32px 64px' },
    head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    h1: { fontSize: 26, margin: 0 },
    sub: { color: '#676879', fontSize: 14, marginBottom: 26 },
    search: { padding: '9px 12px', border: '1px solid #c3c6d4', borderRadius: 6, fontSize: 14, width: 260 },
    btn: { padding: '9px 16px', border: 'none', borderRadius: 6, background: '#0073ea', color: '#fff', cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))', gap: 18 },
    card: { display: 'block', background: '#fff', border: '1px solid #e0e3ee', borderRadius: 10, padding: 18, textDecoration: 'none', color: 'inherit', transition: 'box-shadow .15s, border-color .15s' },
    cardTitle: { fontSize: 17, fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 },
    meta: { color: '#676879', fontSize: 13, marginBottom: 14 },
    avatars: { display: 'flex', alignItems: 'center', gap: -6 },
    avatar: { width: 26, height: 26, borderRadius: '50%', background: '#c3c6d4', color: '#fff', fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: -6, border: '2px solid #fff' },
    empty: { background: '#fff', border: '1px dashed #c3c6d4', borderRadius: 10, padding: '56px 32px', textAlign: 'center' },
    err: { background: '#fff0f2', border: '1px solid #e2445c', color: '#a3283a', padding: '10px 14px', borderRadius: 6, marginBottom: 18 },
    link: { color: '#0073ea', textDecoration: 'none' },
}

function initials (name = '') {
    return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

function countTasks (board) {
    return (board.groups || []).reduce((n, g) => n + (g.tasks ? g.tasks.length : 0), 0)
}

export function BoardsOverview () {
    const boards = useSelector(storeState => storeState.boardModule.boards)
    const user = useSelector(storeState => storeState.userModule.user)
    const [isLoading, setIsLoading] = useState(true)
    const [filter, setFilter] = useState('')
    const [err, setErr] = useState(null)
    const navigate = useNavigate()

    useEffect(() => {
        loadBoards()
            .catch(e => setErr(e?.response?.data?.err || 'Boards konnten nicht geladen werden.'))
            .finally(() => setIsLoading(false))
    }, [])

    async function onCreateBoard () {
        setErr(null)
        try {
            const board = boardService.getEmptyBoard()
            board.title = 'Neues Board'
            const saved = await saveBoard(board)
            if (saved && saved._id) navigate(`/board/${saved._id}`)
            else await loadBoards()
        } catch (e) {
            setErr(e?.response?.data?.err || 'Board konnte nicht angelegt werden.')
        }
    }

    async function onLogout () {
        await logout()
        navigate('/auth/login', { replace: true })
    }

    const visible = filter
        ? boards.filter(b => b.title.toLowerCase().includes(filter.toLowerCase()))
        : boards

    if (isLoading) return <Loader />

    return (
        <div style={S.page}>
            <div style={S.bar}>
                <div style={S.barRight}>
                    <Link to='/profil' style={{ ...S.link, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <img src={user?.imgUrl || GUEST_IMG} alt='' style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
                        {user?.fullname}
                    </Link>
                    <span onClick={onLogout} style={{ ...S.link, cursor: 'pointer' }}>Abmelden</span>
                </div>
            </div>

            <div style={S.main}>
                <div style={S.head}>
                    <h1 style={S.h1}>Meine Boards</h1>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <input style={S.search} placeholder='Board suchen…' value={filter}
                            onChange={e => setFilter(e.target.value)} />
                        <button style={S.btn} onClick={onCreateBoard}>+ Neues Board</button>
                    </div>
                </div>
                <p style={S.sub}>
                    {boards.length === 0
                        ? 'Du bist noch in keinem Board.'
                        : `${boards.length} Board${boards.length === 1 ? '' : 's'}, in denen du Mitglied oder Owner bist.`}
                </p>

                {err && <div style={S.err}>{err}</div>}

                {boards.length === 0 && (
                    <div style={S.empty}>
                        <p style={{ fontSize: 17, marginBottom: 6 }}>Hier ist noch nichts.</p>
                        <p style={{ color: '#676879', marginBottom: 22 }}>
                            Leg dein erstes Board an — oder lass dich von einem Owner zu einem bestehenden einladen.
                        </p>
                        <button style={S.btn} onClick={onCreateBoard}>+ Erstes Board anlegen</button>
                    </div>
                )}

                {boards.length > 0 && visible.length === 0 && (
                    <p style={{ color: '#676879' }}>Kein Board passt zu „{filter}".</p>
                )}

                {visible.length > 0 && (
                    <div style={S.grid}>
                        {visible.map(board => {
                            const isOwner = boardService.isBoardOwner(board, user)
                            const members = board.members || []
                            return (
                                <Link key={board._id} to={`/board/${board._id}`} style={S.card}
                                    onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 3px 12px rgba(0,0,0,.09)'; e.currentTarget.style.borderColor = '#0073ea' }}
                                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#e0e3ee' }}>
                                    <div style={S.cardTitle}>
                                        {isOwner && <span title='Du bist Owner dieses Boards' style={{ color: '#fdab3d' }}>★</span>}
                                        {board.title}
                                    </div>
                                    <div style={S.meta}>
                                        {(board.groups || []).length} Gruppen · {countTasks(board)} Tasks
                                    </div>
                                    <div style={S.avatars}>
                                        {members.slice(0, 5).map(m => (
                                            <span key={m._id} style={S.avatar} title={m.fullname}>
                                                {m.imgUrl
                                                    ? <img src={m.imgUrl} alt='' style={{ width: '100%', height: '100%', borderRadius: '50%' }} />
                                                    : initials(m.fullname)}
                                            </span>
                                        ))}
                                        {members.length > 5 && (
                                            <span style={{ ...S.avatar, background: '#e6e9ef', color: '#676879' }}>
                                                +{members.length - 5}
                                            </span>
                                        )}
                                        {members.length === 0 && <span style={{ color: '#9699a6', fontSize: 13 }}>keine Mitglieder</span>}
                                    </div>
                                </Link>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
