import {utilService} from '../../services/util.service'

import { Icon } from '../icon'
import { Avatar } from '../avatar'
export function UpdatedPicker({info, onUpdate, field = 'updatedBy'}){
    return (
        <section className="updated-picker picker">
            <div className="updated-picker-content flex align-center space-between">
                {info[field]?.imgUrl && <Avatar src={info[field]?.imgUrl}/>}
                {!info[field]?.imgUrl && <Icon name='circle-user' className="icon-person"/>}
                <span className="updated-date">
                    {info[field]?.date?utilService.calculateTime(info[field].date):''}
                </span>
            </div>
        </section>
    )
}