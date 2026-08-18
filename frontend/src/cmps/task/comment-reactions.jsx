import {useState} from 'react'
import {Tooltip} from '@mui/material'
import {Icon} from '../icon'
import {Avatar} from '../avatar'
import {t} from '../../i18n'
import {REACTIONS} from '../../services/reaction.service'
import {useDismissable} from '../../customHooks/useDismissable'

/**
 * What an update was given, and the way to give it something.
 *
 * Two parts that read as one row: the chips that are already there, and a
 * button that opens the six. The chips come first — what other people said is
 * the information; adding to it is the action, and an action belongs after the
 * thing it acts on.
 *
 * A chip that is already yours is outlined. Clicking it again takes it back;
 * the same button both ways, because "unlike" as a separate control is a thing
 * nobody looks for.
 */
export function CommentReactions({reactions = {}, onToggle, canReact = true, people = []}){
    const [isPickerOpen, setIsPickerOpen] = useState(false)
    const pickerRef = useDismissable(isPickerOpen, () => setIsPickerOpen(false))

    const given = Object.entries(reactions).filter(([, group]) => group && group.count > 0)

    /**
     * Who gave this one.
     *
     * A count answers "how many"; on a team of fifteen the question is almost
     * always "who". The ids come with the group, the names come from the board
     * — nobody who reacted can fail to be a member of it, and one that is
     * missing anyway gets a placeholder rather than an empty line.
     */
    function whoGave(group){
        const byId = new Map((people || []).map(person => [String(person._id), person]))
        const seen = new Set()
        const list = []
        for(const userId of group.userIds || []){
            const id = String(userId)
            if(seen.has(id)) continue
            seen.add(id)
            const person = byId.get(id)
            list.push({_id: id, fullname: person?.fullname || t('update.someone'), imgUrl: person?.imgUrl || ''})
        }
        return list
    }

    async function choose(emoji){
        setIsPickerOpen(false)
        await onToggle(emoji)
    }

    return (
        <div className="comment-reactions">
            {given.map(([emoji, group]) => (
                <Tooltip key={emoji} arrow placement="top" title={
                    <span className="reaction-who">
                        {whoGave(group).map(person => (
                            <span key={person._id} className="reaction-who-line">
                                <Avatar src={person.imgUrl}/>
                                {person.fullname}
                            </span>
                        ))}
                    </span>
                }>
                    <button type="button"
                        className={`reaction-chip${group.mine?' is-mine':''}`}
                        disabled={!canReact}
                        onClick={() => onToggle(emoji)}>
                        <span className="reaction-emoji">{emoji}</span>
                        <span className="reaction-count">{group.count}</span>
                    </button>
                </Tooltip>
            ))}

            {canReact && <div className="reaction-picker-anchor" ref={pickerRef}>
                <button type="button" className="reaction-add" title={t('update.react')}
                    onClick={() => setIsPickerOpen(open => !open)}>
                    <Icon name="face-smile" variant="fa-regular"/>
                </button>

                {isPickerOpen && <div className="reaction-picker" role="menu">
                    {REACTIONS.map(emoji => (
                        <button key={emoji} type="button" role="menuitem"
                            className={`reaction-option${reactions[emoji]?.mine?' is-mine':''}`}
                            onClick={() => choose(emoji)}>
                            {emoji}
                        </button>
                    ))}
                </div>}
            </div>}
        </div>
    )
}
