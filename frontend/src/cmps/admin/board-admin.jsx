import {Link} from 'react-router-dom'

import {boardService} from '../../services/board.service'
import {t} from '../../i18n'

/**
 * Which boards exist, who is on them, and who owns them.
 *
 * Owner is a toggle on the name rather than a column of its own: a board has
 * two or three owners at most, and a second column of stars for forty rows
 * says the same thing with twice the ink.
 */
export function BoardAdmin({users, boards, onChanged, onError, onFlash}){

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

    function onAddMember(board, userId){
        if(!userId) return
        const user = users.find(u => u._id === userId)
        if(!user) return
        return run(() => boardService.setMembers(board._id, [...(board.members || []), {
            _id: user._id,
            fullname: user.fullname,
            imgUrl: user.imgUrl || ''
        }]), t('admin.memberAdded', {name: user.fullname, board: board.title}))
    }

    const onRemoveMember = (board, memberId) => run(
        () => boardService.setMembers(board._id,
            (board.members || []).filter(m => String(m._id) !== String(memberId))),
        t('member.removed'))

    async function onToggleOwner(board, userId){
        const owners = boardService.ownerIdsOf(board)
        const isOwner = owners.includes(String(userId))
        // A board with no owner has nobody who may invite anybody, which is a
        // board that can only be repaired from the database.
        if(isOwner && owners.length === 1){
            onError(new Error(t('admin.ownerRequired')))
            return
        }
        const user = users.find(x => String(x._id) === String(userId))
        await run(() => boardService.setOwners(board._id, isOwner
            ?owners.filter(id => id !== String(userId))
            :[...owners, String(userId)]),
        t(isOwner?'admin.ownerRevoked':'admin.ownerGranted',
            {name: user?user.fullname:userId, board: board.title}))
    }

    return (
        <div className="admin-card">
            <h2 className="admin-section-title">{t('admin.boardsHeading', {n: boards.length})}</h2>
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
                        const owners = boardService.ownerIdsOf(b)
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
            <p className="admin-sub is-footnote">{t('admin.boardsFootnote')}</p>
        </div>
    )
}
