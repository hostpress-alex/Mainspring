/**
 * Filtering a board by its own columns.
 *
 * Pure: a task, a rule, an answer. No board loading, no store, no React —
 * which is what makes the awkward parts checkable. And they are awkward: an
 * empty value is not the same as a zero, "is not" has to be true for a task
 * that has no value at all, and a date is compared by the day rather than by
 * the millisecond.
 *
 * ## Where this runs
 *
 * In the browser, on the board that is already loaded. Not in SQL, and that is
 * a decision rather than laziness: a board that arrives already filtered is a
 * board the write paths also see filtered, and that is how tasks get lost on
 * the next save. Filtering a few hundred tasks in the client is instant.
 *
 * ## The vocabulary
 *
 * Deliberately small, and per column type — a "contains" on a status column
 * that holds one of five labels is a worse question than "is one of".
 */
import {dayDiff} from './due-date'

/** Columns that are not columns: the group a task is in, and its title. */
export const GROUP_FIELD = '__group'
export const TITLE_FIELD = '__title'

export const MODE_ALL = 'all'
export const MODE_ANY = 'any'

const sid = v => (v === undefined || v === null)?'':String(v)
const lower = v => sid(v).toLowerCase()

/**
 * What each kind of column can be asked.
 *
 * The first entry is what a new rule starts with, so it should be the question
 * people ask most of that kind.
 */
const BY_TYPE = {
    text: ['contains', 'notContains', 'is', 'isNot', 'isEmpty', 'isNotEmpty'],
    longtext: ['contains', 'notContains', 'isEmpty', 'isNotEmpty'],
    link: ['contains', 'notContains', 'isEmpty', 'isNotEmpty'],
    dropdown: ['is', 'isNot', 'contains', 'isEmpty', 'isNotEmpty'],
    status: ['isAnyOf', 'isNoneOf', 'isEmpty', 'isNotEmpty'],
    priority: ['isAnyOf', 'isNoneOf', 'isEmpty', 'isNotEmpty'],
    person: ['isAnyOf', 'isNoneOf', 'isEmpty', 'isNotEmpty'],
    // A task carries several, so the same questions as the person
    // column — anyOf already understands a list on both sides.
    tags: ['isAnyOf', 'isNoneOf', 'isEmpty', 'isNotEmpty'],
    date: ['is', 'before', 'after', 'overdue', 'isEmpty', 'isNotEmpty'],
    updated: ['before', 'after'],
    // A moment, and one that never changes — so only the two questions
    // worth asking about it: newer than, older than.
    created: ['before', 'after'],
    number: ['eq', 'ne', 'gt', 'lt', 'isEmpty', 'isNotEmpty'],
    // Stored as minutes, so the same comparisons as a number — the
    // person types 90 and means an hour and a half.
    estimate: ['eq', 'ne', 'gt', 'lt', 'isEmpty', 'isNotEmpty'],
    checkbox: ['isChecked', 'isNotChecked'],
    file: ['isEmpty', 'isNotEmpty']
}

/** The two that are not board columns behave like a status and a text. */
const VIRTUAL = {
    [GROUP_FIELD]: {type: 'status', title: null},
    [TITLE_FIELD]: {type: 'text', title: null}
}

/** Which operators a column offers. Unknown types are treated as text. */
export function operatorsFor(column){
    if(!column) return []
    const virtual = VIRTUAL[column.field]
    const type = virtual?virtual.type:column.type
    return BY_TYPE[type] || BY_TYPE.text
}

/** Does this operator need a value at all? */
export const needsValue = operator =>
    !['isEmpty', 'isNotEmpty', 'isChecked', 'isNotChecked', 'overdue'].includes(operator)

/** Does it take a list rather than one value? */
export const takesList = operator => ['isAnyOf', 'isNoneOf'].includes(operator)

/**
 * The value a rule looks at.
 *
 * The two virtual fields are read from where they actually live: the group is
 * not on the task at all, and the title is not in the column values.
 */
function valueOf(task, field, group){
    if(field === GROUP_FIELD) return group?group.id:null
    if(field === TITLE_FIELD) return task.title
    if(field === 'memberIds') return task.memberIds || []
    return task[field]
}

const isBlank = value => value === undefined || value === null || value === ''
    || (Array.isArray(value) && !value.length)

/**
 * One rule against one task.
 *
 * A rule that is not finished — no column, or no value where one is needed —
 * is TRUE rather than false. Half a rule must not empty the board while
 * somebody is still typing it.
 */
export function matchesRule(task, rule, {group, columns = []} = {}){
    if(!rule || !rule.field || !rule.operator) return true

    const column = VIRTUAL[rule.field]
        ?{field: rule.field, ...VIRTUAL[rule.field]}
        :columns.find(c => c && c.field === rule.field)
    if(!column) return true
    if(needsValue(rule.operator) && isBlank(rule.value)) return true

    const raw = valueOf(task, rule.field, group)
    const list = Array.isArray(rule.value)?rule.value.map(sid):[sid(rule.value)]

    // `is` means different things to different columns: the same text, or the
    // same DAY. Routed here rather than inside the switch, because the switch
    // is on the operator and this difference is about the column.
    const isDate = column.type === 'date' || column.type === 'updated' || column.type === 'created'
    if(isDate && rule.operator === 'is') return sameDay(dateOf(raw), rule.value)

    switch(rule.operator){
        case 'isEmpty': return isBlank(raw)
        case 'isNotEmpty': return !isBlank(raw)
        case 'isChecked': return Boolean(raw)
        case 'isNotChecked': return !raw

        case 'contains': return lower(raw).includes(lower(rule.value))
        // Not the negation of `contains` on its own: a task with no value at
        // all "does not contain" the word, and people mean that.
        case 'notContains': return !lower(raw).includes(lower(rule.value))
        case 'is': return lower(raw) === lower(rule.value)
        case 'isNot': return lower(raw) !== lower(rule.value)

        case 'isAnyOf': return anyOf(raw, list)
        case 'isNoneOf': return !anyOf(raw, list)

        case 'eq': return Number(raw) === Number(rule.value)
        case 'ne': return !isBlank(raw) && Number(raw) !== Number(rule.value)
        case 'gt': return !isBlank(raw) && Number(raw) > Number(rule.value)
        case 'lt': return !isBlank(raw) && Number(raw) < Number(rule.value)

        // Dates are compared by the DAY. "before 5 September" has to include
        // the whole of the fourth, whatever time of day is stored — see
        // due-date.js for the same reasoning about calendar days.
        case 'before': return !isBlank(dateOf(raw)) && dayDiff(dateOf(raw), rule.value) < 0
        case 'after': return !isBlank(dateOf(raw)) && dayDiff(dateOf(raw), rule.value) > 0
        case 'overdue': return !isBlank(dateOf(raw)) && dayDiff(dateOf(raw)) < 0

        default: return true
    }
}

/** `is` on a date means the same day, not the same millisecond. */
function sameDay(a, b){
    return !isBlank(a) && !isBlank(b) && dayDiff(a, b) === 0
}

/** A date column holds a timestamp; `updated` holds an object with one. */
function dateOf(raw){
    if(raw && typeof raw === 'object' && !Array.isArray(raw)) return raw.date ?? null
    return raw
}

/** A value that may itself be a list — the person column is one. */
function anyOf(raw, list){
    if(Array.isArray(raw)) return raw.map(sid).some(v => list.includes(v))
    return list.includes(sid(raw))
}

/**
 * All the rules against one task.
 *
 * `all` needs every rule, `any` needs one. An empty rule set matches
 * everything — a filter nobody has filled in is not a filter.
 */
export function matchesTask(task, rules = [], mode = MODE_ALL, context = {}){
    const real = (rules || []).filter(r => r && r.field && r.operator)
    if(!real.length) return true
    if(mode === MODE_ANY) return real.some(rule => matchesRule(task, rule, context))
    return real.every(rule => matchesRule(task, rule, context))
}

/** True when there is anything to apply at all. */
export const hasRules = rules =>
    (rules || []).some(r => r && r.field && r.operator)

export const emptyRule = () => ({field: null, operator: null, value: null})
