import {utilService} from '../../services/util.service'

import { Icon } from '../icon'
import { Avatar } from '../avatar'
/**
 * Who last touched the task, and when. There is nothing to click here, so
 * `readOnly` is accepted and ignored — the prop exists so that every picker
 * takes the same ones and DynamicCmp does not have to know which is which.
 */
export function UpdatedPicker({info, onUpdate, field = 'updatedBy', readOnly = false}){
    return (
        <section className="updated-picker picker">
            <div className="updated-picker-content flex">
                {info[field]?.imgUrl && <Avatar src={info[field]?.imgUrl}/>}
                {!info[field]?.imgUrl && <Icon name='circle-user' className="icon-person"/>}
                <span className="updated-date">
                    {info[field]?.date?utilService.calculateTime(info[field].date):''}
                </span>
            </div>
        </section>
    )
}