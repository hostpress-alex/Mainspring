import {useState} from 'react'

import {Icon} from '../icon'
import {useDismissable} from '../../customHooks/useDismissable'
import {DISPLAYS, DISPLAY_ICON, canManageTab, canShareTab} from '../../services/board-view'
import {hasRules} from '../../services/board-filter'
import {t} from '../../i18n'

/**
 * The tabs across the top of a board.
 *
 * Table, kanban and dashboard used to be three buttons here, and a saved
 * filter was a chip hidden inside the filter panel. Two strips of the same
 * idea, one of which nobody found. They are one strip now: a tab says which
 * rows and which drawing, and the three built-in ones are simply the tabs
 * with no rules.
 *
 * The new-tab form takes the filter that is set RIGHT NOW. That is the whole
 * point of the feature — you build a view by looking at it, and then keep
 * what you are looking at.
 */
export function BoardViews({board, me, tabs, activeId, filter, err, onActivate, onCreate, onUpdate, onRemove}){
    const [isNewOpen, setIsNewOpen] = useState(false)
    const newRef = useDismissable(isNewOpen, () => setIsNewOpen(false))

    return (
        <div className="board-views flex">
            {tabs.map(tab => (
                <Tab key={tab.id} tab={tab} board={board} me={me}
                    isActive={String(tab.id) === String(activeId)}
                    onActivate={() => onActivate(tab)}
                    onUpdate={patch => onUpdate(tab, patch)}
                    onRemove={() => onRemove(tab)}/>
            ))}

            <div className="view-new" ref={newRef}>
                <button type="button" className="view-add" title={t('view.add')}
                    onClick={() => setIsNewOpen(open => !open)}>
                    <Icon name='plus'/>
                </button>
                {isNewOpen && (
                    <NewTabForm board={board} me={me} filter={filter}
                        onClose={() => setIsNewOpen(false)}
                        onCreate={async draft => {
                            await onCreate(draft)
                            setIsNewOpen(false)
                        }}/>
                )}
            </div>

            {/* Beside the strip, not in a dialog: what failed is a tab, and
                the tabs are what you are looking at. */}
            {err && <span className="view-error" role="alert">{err}</span>}
        </div>
    )
}

/** One tab, plus the menu for the ones you may change. */
function Tab({tab, board, me, isActive, onActivate, onUpdate, onRemove}){
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const menuRef = useDismissable(isMenuOpen, () => setIsMenuOpen(false))
    const mayManage = canManageTab(tab, board, me)

    return (
        <div className={`view-tab${isActive?' is-active':''}`} ref={menuRef}>
            <button type="button" className="view-open" onClick={onActivate}>
                <Icon name={DISPLAY_ICON[tab.display] || 'house'} className="icon"/>
                <span className="view-name">{tab.title}</span>
                {!tab.builtin && tab.visibility !== 'board' &&
                    <Icon name='lock' className="view-private" title={t('view.private')}/>}
            </button>

            {/* The menu only exists on a tab you may change, and only while
                you are standing on it — a row of chevrons across every tab is
                noise on a strip you read left to right. */}
            {mayManage && isActive && (
                <button type="button" className="view-more" title={t('view.menu')}
                    onClick={() => setIsMenuOpen(open => !open)}>
                    <Icon name='angle-down'/>
                </button>
            )}

            {isMenuOpen && (
                <TabMenu tab={tab} board={board} me={me}
                    onClose={() => setIsMenuOpen(false)}
                    onUpdate={patch => {
                        setIsMenuOpen(false)
                        onUpdate(patch)
                    }}
                    onRemove={() => {
                        setIsMenuOpen(false)
                        onRemove()
                    }}/>
            )}
        </div>
    )
}

function TabMenu({tab, board, me, onUpdate, onRemove}){
    const isShared = tab.visibility === 'board'
    const mayShare = canShareTab(board, me)

    function onRename(){
        const title = window.prompt(t('view.rename'), tab.title)
        if(!title || !title.trim() || title.trim() === tab.title) return
        onUpdate({title: title.trim()})
    }

    return (
        <ul className="view-menu">
            <li><button type="button" onClick={onRename}>
                <Icon name='pen'/> {t('view.rename')}
            </button></li>

            {DISPLAYS.filter(d => d !== tab.display).map(display => (
                <li key={display}><button type="button" onClick={() => onUpdate({display})}>
                    <Icon name={DISPLAY_ICON[display]}/> {t('view.showAs', {what: t(`board.${display}`)})}
                </button></li>
            ))}

            {/* Unsharing is open to whoever may share: taking your own tab
                back out of everybody's way should never need more rights than
                putting it there. */}
            {(mayShare || isShared) && (
                <li><button type="button" disabled={!mayShare && !isShared}
                    onClick={() => onUpdate({visibility: isShared?'private':'board'})}>
                    <Icon name={isShared?'lock':'users'}/>
                    {isShared?t('view.makePrivate'):t('view.share')}
                </button></li>
            )}

            <li><button type="button" className="is-danger" onClick={onRemove}>
                <Icon name='trash'/> {t('common.delete')}
            </button></li>
        </ul>
    )
}

/**
 * The form behind the plus.
 *
 * Deliberately not a window.prompt like the old "save as view": a tab needs a
 * name, a drawing and a decision about who sees it, and three prompts in a
 * row is not a form.
 */
function NewTabForm({board, me, filter, onCreate, onClose}){
    const [title, setTitle] = useState('')
    const [display, setDisplay] = useState('table')
    const [shared, setShared] = useState(false)
    const [busy, setBusy] = useState(false)
    const mayShare = canShareTab(board, me)
    const count = (filter.rules || []).filter(r => r && r.field).length

    async function onSubmit(ev){
        ev.preventDefault()
        if(!title.trim() || busy) return
        setBusy(true)
        try {
            await onCreate({
                title: title.trim(),
                display,
                visibility: (shared && mayShare)?'board':'private',
                rules: filter.rules || [],
                mode: filter.mode
            })
        } finally {
            setBusy(false)
        }
    }

    return (
        <form className="view-form" onSubmit={onSubmit}>
            <header>
                <h4>{t('view.add')}</h4>
                <button type="button" className="view-form-close" onClick={onClose} title={t('common.close')}>
                    <Icon name='xmark'/>
                </button>
            </header>

            <input className="view-form-title" autoFocus value={title} placeholder={t('view.namePlaceholder')}
                onChange={ev => setTitle(ev.target.value)}/>

            <div className="view-form-displays">
                {DISPLAYS.map(d => (
                    <button key={d} type="button" className={d === display?'is-active':''}
                        onClick={() => setDisplay(d)}>
                        <Icon name={DISPLAY_ICON[d]}/> {t(`board.${d}`)}
                    </button>
                ))}
            </div>

            <label className={`view-form-share${mayShare?'':' is-off'}`}>
                <input type="checkbox" checked={shared && mayShare} disabled={!mayShare}
                    onChange={ev => setShared(ev.target.checked)}/>
                <span>{mayShare?t('view.shareHint'):t('view.shareDenied')}</span>
            </label>

            <p className="view-form-note">{t('view.takesCurrent', {n: count})}</p>

            <button type="submit" className="view-form-save" disabled={!title.trim() || busy}>
                {t('common.save')}
            </button>
        </form>
    )
}
