import {useEffect, useMemo, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {useLocation, useNavigate, useSearchParams} from 'react-router-dom'

import {Icon} from '../icon'
import {Avatar} from '../avatar'
import {searchService, MIN_TERM} from '../../services/search.service'
import {fileSize} from '../task/file-type'
import {utilService} from '../../services/util.service'
import {withTaskParams} from '../../services/task-link'
import {t} from '../../i18n'

/**
 * Search everything at once.
 *
 * Five kinds of thing in one list, each with the board it came from — without
 * that a task called "Test" from one of forty boards is not an answer.
 *
 * What is NOT in here, deliberately: any filtering of the results. Everything
 * that arrives may be seen by the person who asked, because the server never
 * put anything else in the answer. A client-side filter would suggest the
 * opposite is possible.
 */
const TABS = ['all', 'boards', 'tasks', 'updates', 'files', 'people']

/** Long enough that typing does not fire a request per letter, short enough
 * that it still feels like the list follows the keyboard. */
const DEBOUNCE = 250

export function SearchPanel({onClose}){
    const [term, setTerm] = useState('')
    const [tab, setTab] = useState('all')
    const [result, setResult] = useState(null)
    const [isLoading, setIsLoading] = useState(false)
    const [err, setErr] = useState(null)
    const navigate = useNavigate()
    const location = useLocation()
    const [searchParams] = useSearchParams()
    const inputRef = useRef(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    useEffect(() => {
        function onKey(ev){
            if(ev.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose])

    /**
     * One request per pause in the typing, and the answer to an older request
     * is thrown away.
     *
     * Without the second half the list flickers back to the results for "an"
     * when that answer arrives after the one for "angebot" — the shorter query
     * is the slower one often enough to be noticed.
     */
    useEffect(() => {
        const clean = term.trim()
        if(clean.length < MIN_TERM){
            setResult(null)
            setErr(null)
            return
        }
        let isCurrent = true
        setIsLoading(true)
        const timer = setTimeout(async () => {
            try {
                const answer = await searchService.query(clean, tab)
                if(!isCurrent) return
                // Cleared on the way IN, not only on the way out: a failed
                // search left its red line standing above the results of the
                // next one, which then read as "these results are wrong".
                setErr(null)
                setResult(answer)
            } catch(e) {
                if(isCurrent) setErr(readErr(e))
            } finally {
                if(isCurrent) setIsLoading(false)
            }
        }, DEBOUNCE)

        return () => {
            isCurrent = false
            clearTimeout(timer)
        }
    }, [term, tab])

    function go(path){
        onClose()
        navigate(path)
    }

    /**
     * A search result that IS a task opens over whatever is behind the search
     * panel, instead of throwing the page away. Typing a search from the
     * calendar and being put on a board was the old behaviour, and it cost the
     * week you were looking at to read one update.
     */
    function goTask({boardId, groupId, taskId}){
        onClose()
        navigate({
            pathname: location.pathname,
            search: `?${withTaskParams(searchParams, {boardId, groupId, taskId}).toString()}`
        })
    }

    const counts = useMemo(() => ({
        boards: result?.boards?.length || 0,
        tasks: result?.tasks?.length || 0,
        updates: result?.updates?.length || 0,
        files: result?.files?.length || 0,
        people: result?.people?.length || 0
    }), [result])

    const total = counts.boards + counts.tasks + counts.updates + counts.files + counts.people
    const isShort = term.trim().length > 0 && term.trim().length < MIN_TERM

    return createPortal(
        <>
            <div className="search-backdrop" onClick={onClose}/>
            <div className="search-overlay" role="dialog" aria-label={t('search.title')}>
                <header className="search-header">
                    <Icon name='magnifying-glass' className="search-icon"/>
                    <input ref={inputRef} className="search-input" value={term}
                        placeholder={t('search.placeholder')}
                        onChange={ev => setTerm(ev.target.value)}/>
                    <button type="button" className="search-close" onClick={onClose} title={t('common.close')}>
                        <Icon name='xmark'/>
                    </button>
                </header>

                <nav className="search-tabs">
                    {TABS.map(key => (
                        <button key={key} type="button" className={tab === key?'is-active':''}
                            onClick={() => setTab(key)}>
                            {t(`search.tab.${key}`)}
                        </button>
                    ))}
                </nav>

                <div className="search-body">
                    {err && <div className="search-error">{err}</div>}
                    {isShort && <p className="search-hint">{t('search.tooShort', {n: MIN_TERM})}</p>}
                    {!isShort && !term.trim() && <p className="search-hint">{t('search.start')}</p>}
                    {isLoading && <p className="search-hint">{t('common.loading')}</p>}
                    {!isLoading && result && total === 0 &&
                        <p className="search-hint">{t('search.nothing', {term: result.term})}</p>}

                    {result?.boards?.map(board => (
                        <button key={'b' + board._id} type="button" className="search-row"
                            onClick={() => go(`/board/${board._id}`)}>
                            <Icon name='chalkboard' className="search-row-icon"/>
                            <span className="search-row-title">{board.title}</span>
                            <span className="search-row-kind">{t('search.kind.board')}</span>
                        </button>
                    ))}

                    {result?.tasks?.map(task => (
                        <button key={'t' + task.id} type="button" className="search-row"
                            onClick={() => goTask({boardId: task.boardId, groupId: task.groupId, taskId: task.id})}>
                            <Icon name={task.isSubtask?'diagram-next':'square-check'} className="search-row-icon"/>
                            <span className="search-row-title">{task.title}</span>
                            <span className="search-row-where">{task.boardTitle} · {task.groupTitle}</span>
                            <span className="search-row-kind">
                                {task.isSubtask?t('search.kind.subtask'):t('search.kind.task')}
                            </span>
                        </button>
                    ))}

                    {result?.updates?.map(update => (
                        <button key={'u' + update.id} type="button" className="search-row"
                            onClick={() => goTask({boardId: update.boardId, groupId: update.groupId, taskId: update.taskId})}>
                            <Icon name='comment' variant='fa-regular' className="search-row-icon"/>
                            <span className="search-row-title">{update.preview}</span>
                            <span className="search-row-where">
                                {update.boardTitle} · {update.taskTitle}
                                {update.byName?` · ${update.byName}`:''}
                                {update.at?` · ${utilService.calculateTime(update.at)}`:''}
                            </span>
                            <span className="search-row-kind">{t('search.kind.update')}</span>
                        </button>
                    ))}

                    {result?.files?.map(file => (
                        <button key={'f' + file.id} type="button" className="search-row"
                            onClick={() => goTask({boardId: file.boardId, groupId: file.groupId, taskId: file.taskId})}>
                            <Icon name='paperclip' className="search-row-icon"/>
                            <span className="search-row-title">{file.name}</span>
                            <span className="search-row-where">
                                {file.boardTitle} · {file.taskTitle}
                                {file.size?` · ${fileSize(file.size)}`:''}
                            </span>
                            <span className="search-row-kind">{t('search.kind.file')}</span>
                        </button>
                    ))}

                    {result?.people?.map(person => (
                        <div key={'p' + person._id} className="search-row is-static">
                            <Avatar src={person.imgUrl} alt="" className="search-row-avatar"/>
                            <span className="search-row-title">{person.fullname}</span>
                            <span className="search-row-where">{person.username}</span>
                            <span className="search-row-kind">{t('search.kind.person')}</span>
                        </div>
                    ))}
                </div>
            </div>
        </>,
        document.body
    )
}

const readErr = e => e?.response?.data?.err || e?.message || t('common.unknownError')
