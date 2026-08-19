import {utilService} from '../services/util.service'

import { Icon } from './icon'
import statusImg from '../assets/img/status.png'
import {GUEST_IMG} from '../services/avatar'
import { Avatar } from './avatar'
import {t} from '../i18n'

/**
 * One entry in the activity log.
 *
 * The entries come from the database and have grown over years in various
 * shapes: from/to is sometimes a label object, sometimes a string, sometimes a
 * number, sometimes nothing at all. React throws as soon as an object is
 * rendered as a child — and without an error boundary that tears down the
 * whole page (a white page instead of the log).
 *
 * Hence, throughout: render nothing directly that is not text, and read no
 * property without checking it.
 */

/** Renders only what is safe to show. Objects become ''. */
function text(value){
    if(value === null || value === undefined) return ''
    if(typeof value === 'string' || typeof value === 'number') return String(value)
    if(typeof value === 'boolean') return value?'ja':'nein'
    // An object has no business here — but better empty than broken.
    if(typeof value === 'object') return String(value.title ?? value.fullname ?? '')
    return ''
}

/** A colour only if it really is one. */
function colorOf(value){
    return (value && typeof value === 'object' && typeof value.color === 'string')?value.color:undefined
}

function imgOf(value){
    return (typeof value === 'string' && value)?value:GUEST_IMG
}

/** What the line says. Without an entry the raw name stays. */
const ACTION_LABELS = {
    status: t('activity.action.status'),
    priority: t('activity.action.priority'),
    date: t('activity.action.date'),
    person: t('activity.action.person'),
    number: t('activity.action.number'),
    create: t('activity.action.create'),
    title: t('activity.action.title'),
    update: t('activity.action.update'),
    reply: t('activity.action.reply'),
    updateEdit: t('activity.action.updateEdit'),
    replyEdit: t('activity.action.replyEdit'),
    updateDelete: t('activity.action.updateDelete'),
    replyDelete: t('activity.action.replyDelete')
}

/**
 * One entry of the activity log.
 *
 * `taskTitle` decides whether the task is named. In the log of ONE task that
 * would be the same name on every line, so the task dialog leaves it out; the
 * board log needs it, otherwise you cannot tell what was touched.
 */
export function ActivityPreview({activity, taskTitle = null}){
    if(!activity) return null
    const byMember = (activity.byMember && typeof activity.byMember === 'object')?activity.byMember:{}
    const action = typeof activity.action === 'string'?activity.action:''

    function getIconAction(){
        switch(action) {
            case 'status':
            case 'priority':
                return <img src={statusImg} alt=""/>
            case 'date':
                return <Icon name='calendar-days' variant='fa-regular' className="icon"/>
            case 'create':
                return <Icon name='circle-plus' className="icon"/>
            case 'person':
                return <Icon name='user-plus' className="icon"/>
            case 'check':
                return <Icon name='square-check' variant='fa-regular' className="icon"/>
            case 'number':
                return <Icon name='hashtag' className="icon"/>
            case 'title':
                return <Icon name='pencil' className="icon"/>
            case 'update':
                return <Icon name='comment' variant='fa-regular' className="icon"/>
            case 'reply':
                return <Icon name='reply' className="icon"/>
            case 'updateEdit':
            case 'replyEdit':
                return <Icon name='pen' className="icon"/>
            case 'updateDelete':
            case 'replyDelete':
                return <Icon name='trash-can' variant='fa-regular' className="icon"/>
            default:
                return null
        }
    }

    function getFromTo(){
        switch(action) {
            case 'status':
            case 'priority':
                return <FromToStatusPriority activity={activity}/>
            case 'date':
                return <FromToDueDate activity={activity}/>
            case 'create':
                return <FromToCreate activity={activity}/>
            case 'person':
                return <FromToPerson activity={activity}/>
            case 'check':
                return <FromToCheck activity={activity}/>
            case 'number':
                return <FromToNumber activity={activity}/>
            case 'title':
                return <FromToTitle activity={activity}/>
            case 'update':
            case 'reply':
            case 'updateEdit':
            case 'replyEdit':
            case 'updateDelete':
            case 'replyDelete':
                return <FromToExcerpt activity={activity}/>
            default:
                return null
        }
    }

    return (
        <section className={`activity-preview${taskTitle?' with-task':''}`}>
            <div className="time-title flex align-center">
                <div className="time flex align-center">
                    <Icon name='clock' variant='fa-regular'/>
                    <span>{activity.createdAt?utilService.calculateTimeWithBefore(activity.createdAt):''}</span>
                </div>
                <div className="who-what">
                    <div className="title flex align-center">
                        <Avatar src={imgOf(byMember.imgUrl)}/>
                    </div>
                    {taskTitle && <div className="activity-task" title={taskTitle}>{taskTitle}</div>}
                </div>
            </div>
            <div className="action flex align-center">
                {getIconAction()}
                <div>{ACTION_LABELS[action] || action}</div>
            </div>
            {getFromTo()}
        </section>
    )
}

function FromToStatusPriority({activity}){
    return (
        <div className="from-to label-container flex align-center">
            <span className="label" style={{'--label-color': colorOf(activity.from)}}>{text(activity.from)}</span>
            <Icon name='chevron-right' className="icon"/>
            <span className="label" style={{'--label-color': colorOf(activity.to)}}>{text(activity.to)}</span>
        </div>
    )
}

/** Only format a date if there really is one. */
function asDate(value){
    if(value === null || value === undefined || value === '') return null
    if(typeof value === 'object') return null
    const date = new Date(value)
    return Number.isNaN(date.getTime())?null:date
}

function FromToDueDate({activity}){
    const from = asDate(activity.from)
    const to = asDate(activity.to)
    const fmt = date => date?`${utilService.getMonthName(date)}  ${date.getDate()}`:'-'
    return (
        <div className="from-to date-container">
            <span className="date">{fmt(from)}</span>
            <Icon name='chevron-right' className="icon"/>
            <span className="date">{fmt(to)}</span>
        </div>
    )
}

function FromToCreate({activity}){
    return (
        <div className="from-to create-container">
            <span>{t('group.group')}: </span>
            <span className="activity-title" style={{'--label-color': colorOf(activity.from)}}>{text(activity.from)}</span>
        </div>
    )
}

function FromToPerson({activity}){
    const img = typeof activity.to === 'string'?activity.to:''
    return (
        <div className="from-to person-container">
            <span>{text(activity.from)}</span>
            {img && <img src={img} alt="activity-img"/>}
        </div>
    )
}

function FromToCheck({activity}){
    const on = value => value === true || value === 'true' || value === 1
    return (
        <div className="from-to check-container">
            <span>{on(activity.from)?<Icon name='check'/>:'    '}</span>
            <span>{on(activity.to)?<Icon name='check'/>:'    '}</span>
        </div>
    )
}

/**
 * The first line of what was written.
 *
 * No arrow and no "before": an update is written or removed, it does not move
 * from one value to another. What it said is the only thing that identifies it
 * in a list, so that is what stands here — cut short in the writing, not with
 * a text-overflow that would hide it from anyone copying the line out.
 */
function FromToExcerpt({activity}){
    const excerpt = text(activity.to)
    if(!excerpt) return null
    return (
        <div className="from-to excerpt-container">
            <span className="excerpt">{excerpt}</span>
        </div>
    )
}

function FromToTitle({activity}){
    return (
        <div className="from-to number-container">
            <span className="number">{text(activity.from) || '—'}</span>
            <Icon name='chevron-right' className="icon"/>
            <span className="number">{text(activity.to)}</span>
        </div>
    )
}

function FromToNumber({activity}){
    return (
        <div className="from-to number-container">
            <span className="number">{text(activity.from)}</span>
            <Icon name='chevron-right' className="icon"/>
            <span className="number">{text(activity.to)}</span>
        </div>
    )
}
