import { utilService } from "../services/util.service"

import { IoTimeOutline } from 'react-icons/io5'
import { IoIosArrowForward, IoIosCheckboxOutline } from 'react-icons/io'
import { CiCalendarDate } from 'react-icons/ci'
import { BsPlusCircle, BsPersonPlus } from 'react-icons/bs'
import { FcCheckmark } from 'react-icons/fc'
import { TbNumbers } from "react-icons/tb"
import { RxPencil1 } from 'react-icons/rx'
import statusImg from '../assets/img/status.png'
import { GUEST_IMG } from '../services/avatar'
import { t } from '../i18n'

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
function text(value) {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string' || typeof value === 'number') return String(value)
    if (typeof value === 'boolean') return value ? 'ja' : 'nein'
    // An object has no business here — but better empty than broken.
    if (typeof value === 'object') return String(value.title ?? value.fullname ?? '')
    return ''
}

/** A colour only if it really is one. */
function colorOf(value) {
    return (value && typeof value === 'object' && typeof value.color === 'string') ? value.color : undefined
}

function imgOf(value) {
    return (typeof value === 'string' && value) ? value : GUEST_IMG
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
}

export function ActivityPreview({ activity }) {
    if (!activity) return null
    const byMember = (activity.byMember && typeof activity.byMember === 'object') ? activity.byMember : {}
    const task = (activity.task && typeof activity.task === 'object') ? activity.task : {}
    const action = typeof activity.action === 'string' ? activity.action : ''

    function getIconAction() {
        switch (action) {
            case 'status':
            case 'priority':
                return <img src={statusImg} alt="" />
            case 'date':
                return <CiCalendarDate className='icon' />
            case 'create':
                return <BsPlusCircle className='icon' />
            case 'person':
                return <BsPersonPlus className='icon' />
            case 'check':
                return <IoIosCheckboxOutline className='icon' />
            case 'number':
                return <TbNumbers className='icon' />
            case 'title':
                return <RxPencil1 className='icon' />
            default:
                return null
        }
    }

    function getFromTo() {
        switch (action) {
            case 'status':
            case 'priority':
                return <FromToStatusPriority activity={activity} />
            case 'date':
                return <FromToDueDate activity={activity} />
            case 'create':
                return <FromToCreate activity={activity} />
            case 'person':
                return <FromToPerson activity={activity} />
            case 'check':
                return <FromToCheck activity={activity} />
            case 'number':
                return <FromToNumber activity={activity} />
            case 'title':
                return <FromToTitle activity={activity} />
            default:
                return null
        }
    }

    return (
        <section className="activity-preview">
            <div className="time-title flex align-center">
                <div className="time flex align-center">
                    <IoTimeOutline />
                    <span>{activity.createdAt ? utilService.calculateTime(activity.createdAt) : ''}</span>
                </div>
                {/* This used to show the task name — in the log of ONE task
                    that means the same name on every line. Who did something
                    is the more useful piece of information. */}
                <div className='title flex align-center'>
                    <img src={imgOf(byMember.imgUrl)} alt="" />
                    <span>{text(byMember.fullname)}</span>
                </div>
            </div>
            <div className='action flex align-center space-between'>
                {getIconAction()}
                <div>{ACTION_LABELS[action] || action}</div>
            </div>
            {getFromTo()}
        </section>
    )
}

function FromToStatusPriority({ activity }) {
    return (
        <div className='from-to label-container flex align-center'>
            <span className='label' style={{ backgroundColor: colorOf(activity.from) }}>{text(activity.from)}</span>
            <IoIosArrowForward className='icon' />
            <span className='label' style={{ backgroundColor: colorOf(activity.to) }}>{text(activity.to)}</span>
        </div>
    )
}

/** Only format a date if there really is one. */
function asDate(value) {
    if (value === null || value === undefined || value === '') return null
    if (typeof value === 'object') return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
}

function FromToDueDate({ activity }) {
    const from = asDate(activity.from)
    const to = asDate(activity.to)
    const fmt = date => date ? `${utilService.getMonthName(date)}  ${date.getDate()}` : '-'
    return (
        <div className='from-to date-container'>
            <span className='date'>{fmt(from)}</span>
            <IoIosArrowForward className='icon' />
            <span className='date'>{fmt(to)}</span>
        </div>
    )
}

function FromToCreate({ activity }) {
    return (
        <div className='from-to create-container'>
            <span>Group: </span>
            <span style={{ color: colorOf(activity.from) }}>{text(activity.from)}</span>
        </div>
    )
}

function FromToPerson({ activity }) {
    const img = typeof activity.to === 'string' ? activity.to : ''
    return (
        <div className='from-to person-container'>
            <span>{text(activity.from)}</span>
            {img && <img src={img} alt="activity-img" />}
        </div>
    )
}

function FromToCheck({ activity }) {
    const on = value => value === true || value === 'true' || value === 1
    return (
        <div className='from-to check-container'>
            <span>{on(activity.from) ? <FcCheckmark /> : '    '}</span>
            <span>{on(activity.to) ? <FcCheckmark /> : '    '}</span>
        </div>
    )
}

function FromToTitle({ activity }) {
    return (
        <div className='from-to number-container'>
            <span className='number'>{text(activity.from) || '—'}</span>
            <IoIosArrowForward className='icon' />
            <span className='number'>{text(activity.to)}</span>
        </div>
    )
}

function FromToNumber({ activity }) {
    return (
        <div className='from-to number-container'>
            <span className='number'>{text(activity.from)}</span>
            <IoIosArrowForward className='icon' />
            <span className='number'>{text(activity.to)}</span>
        </div>
    )
}
