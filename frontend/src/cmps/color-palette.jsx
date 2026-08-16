import {useSelector} from 'react-redux'

import {closeDynamicModal, updateGroupAction} from '../store/board.actions'
import {utilService} from '../services/util.service'
import {t} from '../i18n'

import {Icon} from './icon'

/**
 * The colour of a group.
 *
 * Two things were wrong here and they hid each other. The palette called
 * `updateGroups`, which despite the name deletes a group — it only ever looked
 * harmless because the whole group was passed where an id belonged, so the
 * request addressed nothing and did nothing. And the colour was written by
 * mutating the group in the store: the picker showed the new colour, the diff
 * against the server state found no change, and a reload brought the old one
 * back.
 *
 * A fresh group object goes to `updateGroupAction` now, which works out what
 * changed and sends a PATCH with the one field.
 */
export function ColorPalette({dynamicModalObj}){
    const colors = utilService.getColors()
    const board = useSelector(storeState => storeState.boardModule.filteredBoard)

    async function onChangeGroupColor(color){
        const group = dynamicModalObj?.group
        if(!group || !board) return
        closeDynamicModal()
        try {
            await updateGroupAction(board, {...group, color})
        } catch(err) {
            console.error('cannot save the group colour', err)
        }
    }

    return (
        <div className="color-palette" role="group" aria-label={t('group.changeColor')}>
            {colors.map(color => (
                <Icon
                    key={color}
                    name="circle"
                    className="color-icon"
                    style={{'--label-color': color}}
                    onClick={() => onChangeGroupColor(color)}
                />
            ))}
        </div>
    )
}
