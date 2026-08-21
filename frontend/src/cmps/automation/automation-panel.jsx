import {useCallback, useEffect, useState} from 'react'
import {createPortal} from 'react-dom'

import {Icon} from '../icon'
import {Avatar} from '../avatar'
import {confirmDelete} from '../confirm-dialog'
import {ActionLine, RuleSentence, TriggerLine} from './automation-sentence'
import {automationService} from '../../services/automation.service'
import {emptyRule, isComplete} from '../../services/automation'
import {utilService} from '../../services/util.service'
import {t} from '../../i18n'
import {localErrorText} from '../../services/error-text'

/**
 * The automations of one board.
 *
 * Three things behind two tabs, which is one more than it looks: the rules,
 * the builder, and the record of what the rules actually did. The last one is
 * not a nicety — a rule that does not fire and a rule that fires and changes
 * nothing look exactly the same from the board, and without the log the only
 * way to tell them apart is to read the server's own log.
 *
 * Rendered into a portal. It covers the board, and a dialog that has to escape
 * the stacking context of whatever opened it is the whole reason that step
 * exists — see setup/_layers.scss.
 */
export function AutomationPanel({board, onClose}){
    const [tab, setTab] = useState('manage')
    const [rules, setRules] = useState([])
    const [runs, setRuns] = useState([])
    const [draft, setDraft] = useState(emptyRule)
    const [isBusy, setIsBusy] = useState(false)
    const [err, setErr] = useState(null)

    const load = useCallback(async () => {
        try {
            setRules(await automationService.query(board._id))
        } catch(e) {
            setErr(readErr(e))
        }
    }, [board._id])

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

    async function openHistory(){
        setTab('history')
        try {
            setRuns(await automationService.runs(board._id))
        } catch(e) {
            setErr(readErr(e))
        }
    }

    /**
     * Write the draft — a new rule, or the one being edited.
     *
     * The same builder either way. A separate edit dialog would be a second
     * place for every trigger and every action to be wrong in.
     */
    async function onSave(){
        setErr(null)
        setIsBusy(true)
        try {
            if(draft.id){
                // Only the sentence. `enabled` is not sent: it belongs to the
                // switch in the list, and carrying it along here would let an
                // open editor undo a toggle made in the meantime.
                await automationService.update(draft.id, {trigger: draft.trigger, actions: draft.actions})
            } else {
                await automationService.create(board._id, draft)
            }
            setDraft(emptyRule())
            await load()
            setTab('manage')
        } catch(e) {
            setErr(readErr(e))
        } finally {
            setIsBusy(false)
        }
    }

    function onEdit(rule){
        setErr(null)
        // A copy, and a deep one for the actions: the builder replaces objects
        // as it goes, and editing the list's own rule would change what is on
        // screen behind a cancel.
        setDraft({id: rule.id, trigger: {...rule.trigger}, actions: (rule.actions || []).map(a => ({...a}))})
        setTab('create')
    }

    function onCancelEdit(){
        setDraft(emptyRule())
        setTab('manage')
    }

    async function onToggle(rule){
        // Written straight to the server rather than optimistically: a switch
        // that flips back a second later is worse than one that waits.
        setErr(null)
        try {
            const saved = await automationService.update(rule.id, {enabled: !rule.enabled})
            setRules(prev => prev.map(r => (r.id === saved.id?saved:r)))
        } catch(e) {
            setErr(readErr(e))
        }
    }

    async function onRemove(rule){
        const ok = await confirmDelete({
            what: t('automation.thisRule'),
            note: t('automation.deleteNote'),
            button: t('automation.delete')
        })
        if(!ok) return
        setErr(null)
        try {
            await automationService.remove(rule.id)
            setRules(prev => prev.filter(r => r.id !== rule.id))
        } catch(e) {
            setErr(readErr(e))
        }
    }

    const canSave = isComplete(draft) && !isBusy

    return createPortal(
        <>
            {/* A click beside it closes it, like every other dialog here. */}
            <div className="automation-backdrop" onClick={onClose}/>
            <div className="automation-overlay">
            <header className="automation-header">
                <h2>{t('automation.title')} <span className="automation-board">{board.title}</span></h2>
                <nav className="automation-tabs">
                    <button type="button" className={tab === 'create'?'is-active':''}
                        onClick={() => setTab('create')}>
                        {draft.id?t('automation.tabEdit'):t('automation.tabCreate')}
                    </button>
                    <button type="button" className={tab === 'manage'?'is-active':''}
                        onClick={() => setTab('manage')}>{t('automation.tabManage')} / {rules.length}</button>
                    <button type="button" className={tab === 'history'?'is-active':''}
                        onClick={openHistory}>{t('automation.tabHistory')}</button>
                </nav>
                <button type="button" className="automation-close" onClick={onClose} title={t('common.close')}>
                    <Icon name='xmark'/>
                </button>
            </header>

            <div className="automation-body">
                {err && <div className="automation-error">{err}</div>}

                {tab === 'create' && (
                    <div className="automation-builder">
                        <TriggerLine rule={draft} board={board} onChange={setDraft}/>
                        <Icon name='arrow-down' className="automation-arrow"/>
                        {(draft.actions.length?draft.actions:[{}]).map((_, index) => (
                            <div className="automation-builder-action" key={index}>
                                {/* The empty draft is shown with one blank
                                    action so there is something to click. It
                                    is not put into the rule until a type is
                                    picked — an action with no type is not a
                                    half-written rule, it is nothing. */}
                                <ActionLine rule={draft.actions.length?draft:{...draft, actions: [{}]}}
                                    index={index} board={board} onChange={setDraft}/>
                                {draft.actions.length > 1 && (
                                    <button type="button" className="automation-icon-btn"
                                        title={t('automation.removeAction')}
                                        onClick={() => setDraft({...draft,
                                            actions: draft.actions.filter((__, i) => i !== index)})}>
                                        <Icon name='xmark'/>
                                    </button>
                                )}
                            </div>
                        ))}
                        <button type="button" className="automation-add-action"
                            disabled={!draft.actions.length}
                            onClick={() => setDraft({...draft, actions: [...draft.actions, {}]})}>
                            <Icon name='plus'/> {t('automation.addAction')}
                        </button>
                        <div className="automation-builder-buttons">
                            <button type="button" className="automation-primary" disabled={!canSave} onClick={onSave}>
                                {draft.id?t('common.save'):t('automation.create')}
                            </button>
                            {draft.id && (
                                <button type="button" className="automation-add-action" onClick={onCancelEdit}>
                                    {t('common.cancel')}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {tab === 'manage' && (
                    <ul className="automation-list">
                        {rules.map(rule => (
                            <li key={rule.id} className={`automation-card${rule.enabled?'':' is-off'}`}>
                                <RuleSentence rule={rule} board={board}/>
                                <div className="automation-card-meta">
                                    <span>{t('automation.updated')} {utilService.calculateTime(rule.updatedAt)}</span>
                                    <MemberFace board={board} userId={rule.createdBy}/>
                                </div>
                                <div className="automation-card-actions">
                                    <button type="button"
                                        className={`automation-switch${rule.enabled?' is-on':''}`}
                                        title={rule.enabled?t('automation.turnOff'):t('automation.turnOn')}
                                        onClick={() => onToggle(rule)}>
                                        <span className="automation-knob"/>
                                    </button>
                                    <button type="button" className="automation-icon-btn"
                                        title={t('automation.edit')} onClick={() => onEdit(rule)}>
                                        <Icon name='pen'/>
                                    </button>
                                    <button type="button" className="automation-icon-btn"
                                        title={t('automation.delete')} onClick={() => onRemove(rule)}>
                                        <Icon name='trash-can' variant='fa-regular'/>
                                    </button>
                                </div>
                            </li>
                        ))}
                        {!rules.length && <li className="automation-empty">{t('automation.empty')}</li>}
                    </ul>
                )}

                {tab === 'history' && (
                    <ul className="automation-runs">
                        {runs.map(run => (
                            <li key={run.id} className={`automation-run is-${run.outcome}`}>
                                <span className="automation-run-outcome">{t(`automation.outcome.${run.outcome}`)}</span>
                                <span className="automation-run-task">{run.taskTitle || '—'}</span>
                                <span className="automation-run-summary">{run.summary}</span>
                                <span className="automation-run-time">{utilService.calculateTime(run.createdAt)}</span>
                            </li>
                        ))}
                        {!runs.length && <li className="automation-empty">{t('automation.noRuns')}</li>}
                    </ul>
                )}
            </div>
            </div>
        </>,
        document.body
    )
}

/** The face of whoever a rule runs as. Says whose rights the board is using. */
function MemberFace({board, userId}){
    const member = (board?.members || []).find(m => m && String(m._id) === String(userId))
    if(!member) return null
    return (
        <span className="automation-owner" title={`${t('automation.runsAs')} ${member.fullname}`}>
            <Avatar src={member.imgUrl} alt=""/>
        </span>
    )
}

const readErr = localErrorText
