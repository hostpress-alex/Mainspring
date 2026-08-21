import {useCallback, useEffect, useState} from 'react'
import {createPortal} from 'react-dom'
import {useNavigate} from 'react-router-dom'

import {Icon} from '../icon'
import {confirmDelete} from '../confirm-dialog'
import {boardService} from '../../services/board.service'
import {utilService} from '../../services/util.service'
import {loadBoard, loadBoards} from '../../store/board.actions'
import {t} from '../../i18n'
import {localErrorText} from '../../services/error-text'

/**
 * What left the board, and how to get it back.
 *
 * One component for both places it is opened from. With a board it shows that
 * board's groups and tasks; without one it shows whole boards. The two views
 * are the same three columns and the same two buttons, and splitting them
 * would mean fixing every wording twice.
 *
 * Two tabs rather than two screens: the bin and the archive are one mechanism
 * with different intent — see the lifecycle migration — and a person looking
 * for something they lost does not know which of the two words they used.
 *
 * A task whose group is in the same bin is not listed. It is not gone: putting
 * the group back brings it along. Offering it separately would offer a restore
 * that cannot work — the task would come back into a group that is not there.
 */
export function BinPanel({board = null, onClose}){
    const [state, setState] = useState('trashed')
    const [bin, setBin] = useState({groups: [], tasks: []})
    const [boards, setBoards] = useState([])
    const [isLoading, setIsLoading] = useState(false)
    const [err, setErr] = useState(null)
    const navigate = useNavigate()

    const load = useCallback(async () => {
        setErr(null)
        setIsLoading(true)
        try {
            if(board) setBin(await boardService.getBin(board._id, state))
            else setBoards(await boardService.getBoardsInState(state))
        } catch(e) {
            setErr(readErr(e))
        } finally {
            setIsLoading(false)
        }
    }, [board, state])

    useEffect(() => {
        load()
    }, [load])

    useEffect(() => {
        function onKey(ev){
            if(ev.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    async function run(fn){
        setErr(null)
        try {
            await fn()
            await load()
            // The board behind the panel has to follow: a restored group
            // appearing only after a reload looks like the button did nothing.
            if(board) await loadBoard(board._id)
            else await loadBoards()
        } catch(e) {
            setErr(readErr(e))
        }
    }

    const restoreGroup = group => run(() => boardService.setGroupState(board._id, group.id, 'active'))
    const restoreTask = task => run(() => boardService.setTaskState(board._id, task.id, 'active'))
    const restoreBoard = item => run(() => boardService.setBoardState(item._id, 'active'))

    async function purge(what, fn){
        const ok = await confirmDelete({
            what,
            note: t('bin.purgeNote'),
            button: t('bin.purge')
        })
        if(!ok) return
        await run(fn)
    }

    const isEmpty = board
        ?!bin.groups.length && !bin.tasks.length
        :!boards.length

    return createPortal(
        <>
            <div className="bin-backdrop" onClick={onClose}/>
            <div className="bin-overlay">
                <header className="bin-header">
                    <h2>
                        {t('bin.title')}
                        {board && <span className="bin-board">{board.title}</span>}
                    </h2>
                    <nav className="bin-tabs">
                        <button type="button" className={state === 'trashed'?'is-active':''}
                            onClick={() => setState('trashed')}>{t('bin.trash')}</button>
                        <button type="button" className={state === 'archived'?'is-active':''}
                            onClick={() => setState('archived')}>{t('bin.archive')}</button>
                    </nav>
                    <button type="button" className="bin-close" onClick={onClose} title={t('common.close')}>
                        <Icon name='xmark'/>
                    </button>
                </header>

                <div className="bin-body">
                    {err && <div className="bin-error">{err}</div>}
                    {isLoading && <div className="bin-empty">{t('common.loading')}</div>}

                    {!isLoading && isEmpty && (
                        <div className="bin-empty">
                            {state === 'trashed'?t('bin.emptyTrash'):t('bin.emptyArchive')}
                        </div>
                    )}

                    {!board && boards.map(item => (
                        <Row key={item._id} icon='chalkboard' title={item.title}
                            subtitle={t('bin.board')} at={item.stateAt}
                            onOpen={() => {
                                onClose()
                                navigate(`/board/${item._id}`)
                            }}
                            onRestore={() => restoreBoard(item)}
                            onPurge={() => purge(item.title, () => boardService.purgeBoard(item._id))}/>
                    ))}

                    {board && bin.groups.map(group => (
                        <Row key={'g' + group.id} icon='layer-group' title={group.title}
                            subtitle={t('bin.groupWith', {n: group.taskCount})} at={group.stateAt}
                            onRestore={() => restoreGroup(group)}
                            onPurge={() => purge(group.title, () => boardService.purgeGroup(board._id, group.id))}/>
                    ))}

                    {board && bin.tasks.map(task => (
                        <Row key={'t' + task.id} icon={task.isSubtask?'diagram-next':'square-check'}
                            title={task.title} subtitle={task.groupTitle} at={task.stateAt}
                            onRestore={() => restoreTask(task)}
                            onPurge={() => purge(task.title, () => boardService.purgeTask(board._id, task.id))}/>
                    ))}
                </div>
            </div>
        </>,
        document.body
    )
}

function Row({icon, title, subtitle, at, onRestore, onPurge, onOpen}){
    return (
        <div className="bin-row">
            <Icon name={icon} className="bin-row-icon"/>
            <span className="bin-row-title" onClick={onOpen} role={onOpen?'button':undefined}>
                {title || '—'}
            </span>
            <span className="bin-row-sub">{subtitle}</span>
            <span className="bin-row-at">{at?utilService.calculateTime(at):''}</span>
            <button type="button" className="bin-restore" onClick={onRestore}>
                <Icon name='rotate-left'/> {t('bin.restore')}
            </button>
            <button type="button" className="bin-purge" title={t('bin.purge')} onClick={onPurge}>
                <Icon name='trash-can' variant='fa-regular'/>
            </button>
        </div>
    )
}

const readErr = localErrorText
