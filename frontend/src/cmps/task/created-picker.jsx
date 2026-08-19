import {Tooltip} from '@mui/material'

import {Avatar} from '../avatar'
import {getLanguage, t} from '../../i18n'

/**
 * When this task began, and who began it.
 *
 * Read-only, and not because a rule forbids editing it: there is nothing to
 * edit. The value is not a column value at all — it lives on the task itself
 * (`createdAt`, `createdBy`), written once when the row was inserted and
 * never again. That is why the column's field is `createdAt` rather than its
 * own id: two Created columns on one board show the same fact, which is
 * exactly right.
 *
 * Tasks from before this existed have no creation date. They show a dash
 * instead of a guess — see the migration for why nothing was invented for
 * them.
 */
export function CreatedPicker({info}){
    const at = Number(info.createdAt)
    const by = info.createdBy && info.createdBy._id?info.createdBy:null

    if(!Number.isFinite(at) || !at){
        return (
            <section className="picker created-picker is-empty" title={t('created.unknown')}>
                <span className="created-dash">—</span>
            </section>
        )
    }

    const language = getLanguage()
    const short = new Intl.DateTimeFormat(language, {day: 'numeric', month: 'short', year: 'numeric'}).format(at)
    const exact = new Intl.DateTimeFormat(language, {dateStyle: 'long', timeStyle: 'short'}).format(at)
    const who = by?(by.fullname || t('update.someone')):t('created.unknownPerson')

    return (
        <Tooltip title={`${who} · ${exact}`} arrow disableInteractive>
            <section className="picker created-picker">
                {/* The picture even when the name is gone: an avatar with no
                    name still says "a person", and the tooltip has the rest. */}
                <Avatar src={by && by.imgUrl} className="created-avatar"/>
                <span className="created-date">{short}</span>
            </section>
        </Tooltip>
    )
}
