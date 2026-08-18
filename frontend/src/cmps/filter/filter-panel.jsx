import {useMemo, useState} from 'react'

import {Icon} from '../icon'
import {canManageTab} from '../../services/board-view'
import {labelsOf} from '../../services/column.service'
import {
    GROUP_FIELD, TITLE_FIELD, MODE_ALL, MODE_ANY,
    emptyRule, hasRules, needsValue, operatorsFor, takesList
} from '../../services/board-filter'
import {t} from '../../i18n'

/**
 * The advanced filter.
 *
 * A row per rule: column, condition, value. One switch at the top decides
 * whether every rule has to match or just one — rather than an and/or on each
 * row, which looks richer and leaves the reader guessing whether `A and B or
 * C` means `(A and B) or C` or `A and (B or C)`. Nobody has ever been glad to
 * find out which.
 *
 * Everything here is display. The rules themselves are applied in
 * services/board-filter.js, which knows nothing about React and can therefore
 * be checked.
 */
export function FilterPanel({board, filter, onChange, onClose, me, activeTab, onUpdateView}){
    const [err, setErr] = useState(null)
    const [saving, setSaving] = useState(false)

    const rules = filter.rules || []
    const shown = rules.length?rules:[emptyRule()]
    const mode = filter.mode || MODE_ALL

    // The saved tabs are drawn across the top of the board now, not as chips
    // down here — see cmps/view/board-views.jsx. What is left for this panel
    // is writing the rules you have in front of you back into the tab you are
    // standing on.
    const isOnView = Boolean(activeTab && !activeTab.builtin)
    const isDirty = isOnView && JSON.stringify({r: activeTab.rules || [], m: activeTab.mode || MODE_ALL})
        !== JSON.stringify({r: rules, m: mode})
    const mayUpdate = isOnView && canManageTab(activeTab, board, me)

    /** The board's columns, plus the two that are not columns. */
    const columns = useMemo(() => [
        {field: GROUP_FIELD, title: t('filter.group'), type: 'status'},
        {field: TITLE_FIELD, title: t('filter.title'), type: 'text'},
        ...(board.columns || []).filter(Boolean)
    ], [board.columns])

    const set = next => onChange({...filter, ...next})

    /**
     * An empty rule set still shows one row, so that the panel does not open
     * on nothing. That row was not IN `rules` though, and writing to it
     * mapped over an empty array and produced an empty array — picking a
     * column in the first row did nothing at all, and the select jumped
     * straight back to "Spalte". The row you can see is the row you write to.
     */
    function setRule(index, patch){
        set({rules: shown.map((rule, i) => (i === index?{...rule, ...patch}:rule))})
    }

    /**
     * A new column means a new question. The operator and the value are
     * dropped rather than carried over — "contains" makes no sense on a date,
     * and a leftover value is how a filter ends up hiding rows for a reason
     * nobody chose.
     */
    function onPickColumn(index, field){
        const column = columns.find(c => c.field === field)
        const [first] = operatorsFor(column)
        setRule(index, {field, operator: first || null, value: null})
    }

    async function onUpdate(){
        setErr(null)
        setSaving(true)
        try {
            await onUpdateView(activeTab, {rules, mode})
        } catch(e) {
            setErr(readErr(e))
        } finally {
            setSaving(false)
        }
    }

    return (
        <section className="filter-panel">
            <header className="filter-head">
                <h3>{t('filter.title2')}</h3>
                <div className="filter-mode">
                    <button type="button" className={mode === MODE_ALL?'is-active':''}
                        onClick={() => set({mode: MODE_ALL})}>{t('filter.modeAll')}</button>
                    <button type="button" className={mode === MODE_ANY?'is-active':''}
                        onClick={() => set({mode: MODE_ANY})}>{t('filter.modeAny')}</button>
                </div>
                <button type="button" className="filter-clear" disabled={!hasRules(rules)}
                    onClick={() => set({rules: []})}>{t('filter.clearAll')}</button>
                <button type="button" className="filter-close" onClick={onClose} title={t('common.close')}>
                    <Icon name='xmark'/>
                </button>
            </header>

            {err && <div className="filter-error">{err}</div>}

            <div className="filter-rules">
                {shown.map((rule, index) => (
                    <Row key={index} rule={rule} index={index} columns={columns} board={board}
                        onPickColumn={onPickColumn} onSet={setRule}
                        onRemove={() => set({rules: shown.filter((_, i) => i !== index)})}/>
                ))}
            </div>

            <div className="filter-actions">
                <button type="button" className="filter-add"
                    onClick={() => set({rules: [...shown, emptyRule()]})}>
                    <Icon name='plus'/> {t('filter.addRule')}
                </button>
                {mayUpdate && (
                    <button type="button" className="filter-add" disabled={!isDirty || saving}
                        onClick={onUpdate}>
                        <Icon name='bookmark'/> {t('filter.updateView', {name: activeTab.title})}
                    </button>
                )}
            </div>

        </section>
    )
}

/** One rule: column, condition, value. */
function Row({rule, index, columns, board, onPickColumn, onSet, onRemove}){
    const column = columns.find(c => c.field === rule.field) || null
    const operators = operatorsFor(column)

    return (
        <div className="filter-row">
            <select className="filter-select" value={rule.field || ''}
                onChange={ev => onPickColumn(index, ev.target.value)}>
                <option value="">{t('filter.column')}</option>
                {columns.map(c => <option key={c.field} value={c.field}>{c.title}</option>)}
            </select>

            <select className="filter-select" value={rule.operator || ''} disabled={!column}
                onChange={ev => onSet(index, {operator: ev.target.value, value: null})}>
                {operators.map(op => <option key={op} value={op}>{t(`filter.op.${op}`)}</option>)}
            </select>

            <ValueField rule={rule} column={column} board={board}
                onChange={value => onSet(index, {value})}/>

            <button type="button" className="filter-drop" title={t('filter.removeRule')} onClick={onRemove}>
                <Icon name='xmark'/>
            </button>
        </div>
    )
}

/**
 * The value, in whatever shape the column needs.
 *
 * A status takes one of its own labels, a person one of the board's members, a
 * date a date field — offering a free text box for all three is what makes a
 * filter that silently matches nothing.
 */
function ValueField({rule, column, board, onChange}){
    if(!column || !rule.operator || !needsValue(rule.operator)){
        return <span className="filter-value is-empty">—</span>
    }

    const options = optionsFor(column, board)

    if(options){
        const chosen = (Array.isArray(rule.value)?rule.value:(rule.value?[rule.value]:[])).map(String)

        // A list of choices, as checkboxes rather than a <select multiple>.
        // The native one needs Cmd-click to pick a second entry and silently
        // drops the first one without it — a control that undoes your last
        // click is not a control.
        if(takesList(rule.operator)){
            if(!options.length) return <span className="filter-value is-empty">{t('filter.noOptions')}</span>
            return (
                <div className="filter-checks">
                    {options.map(o => {
                        const key = String(o.key)
                        const on = chosen.includes(key)
                        return (
                            <label key={key} className={on?'is-on':''}>
                                <input type="checkbox" checked={on}
                                    onChange={() => onChange(on
                                        ?chosen.filter(v => v !== key)
                                        :[...chosen, key])}/>
                                <span>{o.label}</span>
                            </label>
                        )
                    })}
                </div>
            )
        }

        return (
            <select className="filter-select filter-value" value={chosen[0] || ''}
                onChange={ev => onChange(ev.target.value)}>
                <option value="">{t('filter.value')}</option>
                {options.map(o => <option key={String(o.key)} value={String(o.key)}>{o.label}</option>)}
            </select>
        )
    }

    if(column.type === 'date' || column.type === 'updated'){
        return (
            <input className="filter-select filter-value" type="date"
                value={rule.value?new Date(rule.value).toISOString().slice(0, 10):''}
                onChange={ev => onChange(ev.target.value?new Date(ev.target.value).getTime():null)}/>
        )
    }

    return (
        <input className="filter-select filter-value"
            type={column.type === 'number'?'number':'text'}
            placeholder={t('filter.value')}
            value={rule.value ?? ''}
            onChange={ev => onChange(ev.target.value)}/>
    )
}

/** The fixed set a column offers, or null when anything goes. */
function optionsFor(column, board){
    if(column.field === GROUP_FIELD){
        return (board.groups || []).map(g => ({key: g.id, label: g.title}))
    }
    if(column.type === 'person'){
        return (board.members || []).map(m => ({key: m._id, label: m.fullname}))
    }
    if(column.type === 'status' || column.type === 'priority' || column.type === 'dropdown'){
        return labelsOf(board, column).map(l => ({key: l.title, label: l.title}))
    }
    return null
}

const readErr = e => e?.response?.data?.err || e?.message || t('common.unknownError')
