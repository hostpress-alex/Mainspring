import {useEffect, useState} from 'react'
import {useSelector} from 'react-redux'
import {useNavigate, Link} from 'react-router-dom'

import {loadBoards, saveBoard} from '../store/board.actions'
import {boardService} from '../services/board.service'
import {logout} from '../store/user.actions'
import {Loader} from '../cmps/loader'
import {BinPanel} from '../cmps/bin/bin-panel'
import {Icon} from '../cmps/icon'
import { Avatar } from '../cmps/avatar'
import {t} from '../i18n'

function initials(name = ''){
    return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

function countTasks(board){
    return (board.groups || []).reduce((n, g) => n + (g.tasks?g.tasks.length:0), 0)
}

export function BoardsOverview(){
    const boards = useSelector(storeState => storeState.boardModule.boards)
    const user = useSelector(storeState => storeState.userModule.user)
    const [isLoading, setIsLoading] = useState(true)
    const [filter, setFilter] = useState('')
    const [isBinOpen, setIsBinOpen] = useState(false)
    const [err, setErr] = useState(null)
    const navigate = useNavigate()

    useEffect(() => {
        loadBoards().catch(e => setErr(e?.response?.data?.err || t('board.loadFailed'))).finally(() => setIsLoading(false))
    }, [])

    async function onCreateBoard(){
        setErr(null)
        try {
            const board = boardService.getEmptyBoard()
            board.title = t('board.newTitle')
            const saved = await saveBoard(board)
            if(saved && saved._id) navigate(`/board/${saved._id}`)
            else await loadBoards()
        } catch(e) {
            setErr(e?.response?.data?.err || t('board.createFailed'))
        }
    }

    async function onLogout(){
        await logout()
        navigate('/auth/login', {replace: true})
    }

    const visible = filter
        ?boards.filter(b => b.title.toLowerCase().includes(filter.toLowerCase()))
        :boards

    if(isLoading) return <Loader/>

    return (
        <div className="boards-overview">
            <div className="overview-bar">
                <div className="overview-bar-user">
                    <Link to="/profil" className="overview-link overview-user">
                        <Avatar src={user?.imgUrl} className="overview-user-img"/>
                        {user?.fullname}
                    </Link>
                    <span onClick={onLogout} className="overview-link overview-logout">{t('nav.logout')}</span>
                </div>
            </div>

            <div className="overview-main">
                <div className="overview-head">
                    <h1 className="overview-title">{t('nav.myBoards')}</h1>
                    <div className="overview-actions">
                        <input className="overview-search" placeholder={t('board.search')} value={filter} onChange={e => setFilter(e.target.value)}/>
                        {/* Whole boards land here rather than in a board's own
                            bin — whoever is looking for one is by definition
                            not inside it any more. */}
                        <button className="overview-btn is-ghost" onClick={() => setIsBinOpen(true)}>
                            <Icon name='trash-can' variant='fa-regular'/> {t('bin.title')}
                        </button>
                        <button className="overview-btn" onClick={onCreateBoard}>{t('board.newButton')}</button>
                    </div>
                </div>
                <p className="overview-sub">
                    {boards.length === 0
                        ?t('board.noneYet')
                        :t('board.count', {n: boards.length})}
                </p>

                {err && <div className="overview-error">{err}</div>}

                {boards.length === 0 && (
                    <div className="overview-empty">
                        <p className="overview-empty-title">{t('board.empty')}</p>
                        <p className="overview-empty-text">{t('board.emptyHint')}</p>
                        <button className="overview-btn" onClick={onCreateBoard}>{t('board.createFirst')}</button>
                    </div>
                )}

                {boards.length > 0 && visible.length === 0 && (
                    <p className="overview-nohit">{t('board.noMatch', {filter})}</p>
                )}

                {visible.length > 0 && (
                    <div className="overview-grid">
                        {visible.map(board => {
                            const isOwner = boardService.isBoardOwner(board, user)
                            const members = board.members || []
                            return (
                                <Link key={board._id} to={`/board/${board._id}`} className="overview-card">
                                    <div className="overview-card-title">
                                        {isOwner &&
                                            <span title={t('board.youAreOwner')} className="overview-owner-star">★</span>}
                                        {board.title}
                                    </div>
                                    <div className="overview-card-meta">
                                        {t('board.cardMeta', {
                                            groups: (board.groups || []).length,
                                            tasks: countTasks(board)
                                        })}
                                    </div>
                                    <div className="overview-avatars">
                                        {members.slice(0, 5).map(m => (
                                            <span key={m._id} className="overview-avatar" title={m.fullname}>
                                                {m.imgUrl
                                                    ?<Avatar src={m.imgUrl}/>
                                                    :initials(m.fullname)}
                                            </span>
                                        ))}
                                        {members.length > 5 && (
                                            <span className="overview-avatar is-more">
                                                +{members.length - 5}
                                            </span>
                                        )}
                                        {members.length === 0 &&
                                            <span className="overview-no-members">{t('board.noMembers')}</span>}
                                    </div>
                                </Link>
                            )
                        })}
                    </div>
                )}
            </div>
            {isBinOpen && <BinPanel onClose={() => setIsBinOpen(false)}/>}
        </div>
    )
}
