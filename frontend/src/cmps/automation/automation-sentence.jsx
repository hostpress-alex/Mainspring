import {Fragment, useState} from 'react'

import {Icon} from '../icon'
import {useDismissable} from '../../customHooks/useDismissable'
import {
    ACTIONS, ACTION_ORDER, TRIGGERS, TRIGGER_ORDER,
    allColumns, columnOf, groupOf, labelColumns
} from '../../services/automation'
import {labelsOf} from '../../services/column.service'
import {t} from '../../i18n'

/**
 * A rule, written as a sentence.
 *
 * The whole point of this shape is that a rule can be read out loud: "when the
 * status changes to Done, move the task to Done". A form with three dropdowns
 * holds the same data and nobody can tell at a glance what it will do.
 *
 * The sentences live in the text catalogue with named holes — "Wenn {column}
 * auf {value} wechselt" — and `Sentence` puts the pickers into the holes.
 * That matters for more than tidiness: German and English do not put the parts
 * in the same order, and a sentence glued together from fixed fragments in the
 * JSX can only ever have one order.
 */
export function Sentence({template, slots}){
    return String(template).split(/(\{\w+\})/).map((part, i) => {
        const hole = /^\{(\w+)\}$/.exec(part)
        if(!hole) return part?<Fragment key={i}>{part}</Fragment>:null
        return <Fragment key={i}>{slots[hole[1]] || null}</Fragment>
    })
}

/**
 * One clickable word in the sentence.
 *
 * `options` is a flat list of {key, label, color}. Nothing here knows what it
 * is choosing between — a column, a label, a group and a person all come
 * through the same door.
 */
export function Slot({label, placeholder, options = [], onPick, readOnly = false}){
    const [isOpen, setIsOpen] = useState(false)
    const ref = useDismissable(isOpen, () => setIsOpen(false))

    if(readOnly) return <b className="automation-slot-static">{label || placeholder}</b>

    return (
        <span className="automation-slot" ref={ref}>
            <button type="button" className={`automation-slot-btn${label?' is-set':''}`}
                onClick={() => setIsOpen(open => !open)}>
                {label || placeholder}
            </button>
            {isOpen && (
                <ul className="automation-slot-list">
                    {options.map(option => (
                        <li key={option.key}>
                            <button type="button" className="automation-slot-option" onClick={() => {
                                onPick(option.key)
                                setIsOpen(false)
                            }}>
                                {option.color && <span className="automation-swatch" style={{'--swatch': option.color}}/>}
                                <span>{option.label}</span>
                            </button>
                        </li>
                    ))}
                    {!options.length && <li className="automation-slot-empty">{t('automation.noOptions')}</li>}
                </ul>
            )}
        </span>
    )
}

/* ------------------------------------------------------------- options -- */

const columnOptions = columns => columns.map(c => ({key: c.field, label: c.title || c.field}))
const groupOptions = board => (board?.groups || []).map(g => ({key: g.id, label: g.title, color: g.color}))

function valueOptions(board, field){
    return labelsOf(board, columnOf(board, field))
        .map(l => ({key: l.title, label: l.title, color: l.color}))
}

const memberOptions = board => [
    {key: 'assignees', label: t('automation.who.assignees')},
    ...(board?.members || []).filter(Boolean).map(m => ({key: m._id, label: m.fullname}))
]

/* ------------------------------------------------------------- trigger -- */

export function TriggerLine({rule, board, onChange, readOnly = false}){
    const trigger = rule.trigger || {}
    const set = patch => onChange({...rule, trigger: {...trigger, ...patch}})

    const kind = (
        <Slot readOnly={readOnly}
            label={trigger.type?t(`automation.trigger.${trigger.type}.name`):null}
            placeholder={t('automation.whenPlaceholder')}
            options={TRIGGER_ORDER.map(type => ({key: type, label: t(`automation.trigger.${type}.name`)}))}
            // A new trigger keeps nothing from the old one: the fields mean
            // different things, and a leftover value from another sentence is
            // how a rule ends up watching something nobody chose.
            onPick={type => onChange({...rule, trigger: {type}})}/>
    )

    if(!trigger.type) return <span className="automation-line">{kind}</span>

    const columns = trigger.type === TRIGGERS.STATUS_CHANGES_TO?labelColumns(board):allColumns(board)
    const slots = {
        column: <Slot readOnly={readOnly}
            label={columnOf(board, trigger.field)?.title}
            placeholder={t('automation.slot.column')}
            options={columnOptions(columns)}
            onPick={field => set({field, value: null})}/>,
        value: <Slot readOnly={readOnly}
            label={trigger.value}
            placeholder={t('automation.slot.value')}
            options={valueOptions(board, trigger.field)}
            onPick={value => set({value})}/>
    }

    return (
        <span className="automation-line">
            <Sentence template={t(`automation.trigger.${trigger.type}.text`)} slots={slots}/>
            {!readOnly && <span className="automation-change">{kind}</span>}
        </span>
    )
}

/* -------------------------------------------------------------- action -- */

export function ActionLine({rule, index, board, onChange, readOnly = false}){
    const action = (rule.actions || [])[index] || {}
    const replace = next => onChange({
        ...rule,
        actions: (rule.actions || []).map((a, i) => (i === index?next:a))
    })
    const set = patch => replace({...action, ...patch})

    const kind = (
        <Slot readOnly={readOnly}
            label={action.type?t(`automation.action.${action.type}.name`):null}
            placeholder={t('automation.thenPlaceholder')}
            options={ACTION_ORDER.map(type => ({key: type, label: t(`automation.action.${type}.name`)}))}
            onPick={type => replace({type})}/>
    )

    if(!action.type) return <span className="automation-line">{kind}</span>

    const slots = {
        column: <Slot readOnly={readOnly}
            label={columnOf(board, action.field)?.title}
            placeholder={t('automation.slot.column')}
            options={columnOptions(allColumns(board))}
            onPick={field => set({field, value: null})}/>,
        value: <Slot readOnly={readOnly}
            label={action.value}
            placeholder={t('automation.slot.value')}
            options={valueOptions(board, action.field)}
            onPick={value => set({value})}/>,
        group: <Slot readOnly={readOnly}
            label={groupOf(board, action.groupId)?.title}
            placeholder={t('automation.slot.group')}
            options={groupOptions(board)}
            onPick={groupId => set({groupId})}/>,
        who: <Slot readOnly={readOnly}
            label={whoLabel(action, board)}
            placeholder={t('automation.slot.who')}
            options={memberOptions(board)}
            onPick={key => set(key === 'assignees'
                ?{who: 'assignees', userIds: []}
                :{who: 'people', userIds: [key]})}/>
    }

    return (
        <span className="automation-line">
            <Sentence template={t(`automation.action.${action.type}.text`)} slots={slots}/>
            {!readOnly && <span className="automation-change">{kind}</span>}
        </span>
    )
}

function whoLabel(action, board){
    if(action.who === 'assignees') return t('automation.who.assignees')
    const id = (action.userIds || [])[0]
    if(!id) return null
    const member = (board?.members || []).find(m => m && String(m._id) === String(id))
    return member?member.fullname:id
}

/** A finished rule, read-only — one line per action under the trigger. */
export function RuleSentence({rule, board}){
    return (
        <div className="automation-sentence">
            <TriggerLine rule={rule} board={board} onChange={() => {}} readOnly/>
            {(rule.actions || []).map((action, index) => (
                <div className="automation-then" key={index}>
                    <Icon name='arrow-right' className="automation-then-arrow"/>
                    <ActionLine rule={rule} index={index} board={board} onChange={() => {}} readOnly/>
                </div>
            ))}
        </div>
    )
}

export {ACTIONS, TRIGGERS}
