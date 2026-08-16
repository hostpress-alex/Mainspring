import {useSelector} from 'react-redux'

import {setDynamicModalObj, updateGroups} from '../store/board.actions'
import {utilService} from '../services/util.service'

import { Icon } from './icon'
export function ColorPalette({dynamicModalObj}){
    const colors = utilService.getColors()
    const board = useSelector(storeState => storeState.boardModule.filteredBoard)

    function onChangeGroupColor(color){
        try {
            dynamicModalObj.group.color = color
            updateGroups(dynamicModalObj.group, board)
            setDynamicModalObj({...dynamicModalObj, isOpen: false})
        } catch(err) {
            console.log(err)
        }
    }

    return (
        <div className="color-palette">
            {colors.map((color, idx) => (
                <Icon name='circle' className="color-icon" onClick={() => onChangeGroupColor(color)} key={idx} style={{'--label-color': color}}/>
            ))}
        </div>
    )
}