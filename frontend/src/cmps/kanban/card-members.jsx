import {Tooltip} from '@mui/material'

import {Avatar} from '../avatar'

/** How many faces fit on a card before they become a "+2". */
const SHOWN = 2

/**
 * Who has this task, on the Kanban card.
 *
 * A face in the title row rather than a "Person: Alex" line in the card body.
 * On a Kanban board "who is doing this" is the first question anybody asks,
 * and answering it with a label/value row costs a line of height on every
 * card to answer it worse — the picture is what people recognise, and they
 * recognise it without reading.
 *
 * Read-only on purpose. Reassigning happens in the table or in the task, where
 * there is room to see who else there is; a card is for finding out, not for
 * changing.
 *
 * Deliberately not `MemberPicker`: that one reads the board out of the store,
 * opens a dialog, writes an activity — none of which a card wants, and all of
 * which it would have to be told not to do.
 */
export function CardMembers({task, board}){
    const byId = new Map((board?.members || []).map(member => [String(member._id), member]))
    // A member who has left the board is dropped rather than drawn as a blank:
    // an empty circle on a card looks like somebody with no picture.
    const people = (task?.memberIds || []).map(id => byId.get(String(id))).filter(Boolean)
    if(!people.length) return null

    const shown = people.slice(0, SHOWN)
    const rest = people.length - shown.length

    return (
        <span className="card-members">
            {shown.map(person => (
                <Tooltip key={person._id} arrow title={person.fullname || ''}>
                    <Avatar className="card-member" src={person.imgUrl} alt=""/>
                </Tooltip>
            ))}
            {rest > 0 && (
                <Tooltip arrow title={people.slice(SHOWN).map(p => p.fullname).filter(Boolean).join(', ')}>
                    <span className="card-member-more">+{rest}</span>
                </Tooltip>
            )}
        </span>
    )
}
