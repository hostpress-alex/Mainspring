import {useState} from 'react'
import {useSelector} from 'react-redux'

import {closeDynamicModal, updateGroupAction} from '../../store/board.actions'
import {Icon} from '../icon'
import {t} from '../../i18n'

/**
 * The symbol in front of a group name.
 *
 * Emoji rather than icons from the app's own set, and stored as the characters
 * themselves. An emoji is text: every platform already knows how to draw it,
 * nothing has to be kept in step with a catalogue, and it survives being
 * copied out of the database into a mail or a chat message.
 *
 * The list is curated, not complete. A full emoji picker is a searchable index
 * of several thousand entries plus their names in every language — for a
 * marker on a project column, sixty that people actually use beat all of them.
 * Anything else can still be pasted into the field at the bottom.
 */
const SETS = [
    ['🚀', '💪', '🎯', '🔥', '⭐', '✅', '⏳', '🧭'],
    ['💡', '🧪', '🛠️', '🐛', '📦', '🧱', '⚙️', '🔧'],
    ['📋', '📝', '📊', '📈', '🗂️', '📅', '🔍', '📌'],
    ['💬', '📣', '🤝', '👥', '🎨', '🖼️', '🌐', '🛒'],
    ['⚠️', '🚨', '⛔', '❄️', '🌱', '🏁', '🏆', '🎉']
]

export function GroupIconPicker({dynamicModalObj}){
    const board = useSelector(storeState => storeState.boardModule.filteredBoard)
    const group = dynamicModalObj?.group
    const [draft, setDraft] = useState(group?.icon || '')

    async function save(icon){
        if(!group || !board) return
        closeDynamicModal()
        try {
            // A fresh object, never the group from the store: updateGroupAction
            // works out what changed by comparing against that state, and
            // writing into it first leaves nothing to find.
            await updateGroupAction(board, {...group, icon})
        } catch(err) {
            console.error('cannot save the group symbol', err)
        }
    }

    return (
        <div className="group-icon-picker">
            <div className="group-icon-grid">
                {SETS.flat().map(emoji => (
                    <button
                        key={emoji}
                        type="button"
                        className={`group-icon-option${emoji === group?.icon?' is-active':''}`}
                        title={emoji}
                        onClick={() => save(emoji)}>
                        {emoji}
                    </button>
                ))}
            </div>

            <form className="group-icon-own" onSubmit={ev => {
                ev.preventDefault()
                save(draft.trim())
            }}>
                <input
                    type="text"
                    value={draft}
                    maxLength={16}
                    placeholder={t('group.iconOwn')}
                    aria-label={t('group.iconOwn')}
                    onChange={ev => setDraft(ev.target.value)}
                />
                <button type="submit" className="group-icon-save">{t('common.save')}</button>
            </form>

            <button type="button" className="group-icon-clear" onClick={() => save('')}>
                <Icon name='ban'/>
                <span>{t('group.iconNone')}</span>
            </button>
        </div>
    )
}
