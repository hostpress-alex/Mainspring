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

/**
 * Ein Eintrag im Aktivitaetsverlauf.
 *
 * Die Eintraege kommen aus der Datenbank und sind ueber Jahre in
 * unterschiedlichen Formen entstanden: from/to sind mal ein Label-Objekt, mal
 * eine Zeichenkette, mal eine Zahl, mal gar nichts. React wirft, sobald ein
 * Objekt als Kind gerendert wird — und ohne Error Boundary reisst das die
 * ganze Seite ab (weisse Seite statt Verlauf).
 *
 * Deshalb hier durchgaengig: nichts direkt rendern, was kein Text ist, und
 * keine Eigenschaft ohne Pruefung lesen.
 */

/** Rendert nur, was sich gefahrlos anzeigen laesst. Objekte werden zu ''. */
function text(value) {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string' || typeof value === 'number') return String(value)
    if (typeof value === 'boolean') return value ? 'ja' : 'nein'
    // Ein Objekt hat hier nichts zu suchen — aber lieber leer als kaputt.
    if (typeof value === 'object') return String(value.title ?? value.fullname ?? '')
    return ''
}

/** Farbe nur, wenn es wirklich eine ist. */
function colorOf(value) {
    return (value && typeof value === 'object' && typeof value.color === 'string') ? value.color : undefined
}

function imgOf(value) {
    return (typeof value === 'string' && value) ? value : GUEST_IMG
}

/** Was in der Zeile steht. Ohne Eintrag bleibt der rohe Name stehen. */
const ACTION_LABELS = {
    status: 'Status',
    priority: 'Priorität',
    date: 'Datum',
    person: 'Person',
    number: 'Zahl',
    create: 'angelegt',
    title: 'Titel',
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
                {/* Frueher stand hier der Task-Name — im Verlauf EINES Tasks
                    also in jeder Zeile derselbe. Wer etwas getan hat, ist die
                    nuetzlichere Information. */}
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

/** Datum nur formatieren, wenn wirklich eins drinsteht. */
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
