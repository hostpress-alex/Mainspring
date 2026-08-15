import { utilService } from "../../services/util.service"

import { BsPersonCircle } from "react-icons/bs"

export function UpdatedPicker({ info, onUpdate, field = 'updatedBy' }) {
    return (
        <section className="updated-picker picker">
            <div className="updated-picker-content flex align-center space-between">
                {info[field]?.imgUrl && <img src={info[field]?.imgUrl} alt="" />}
                {!info[field]?.imgUrl && <BsPersonCircle className="icon-person" />}
                <span className="updated-date">
                    {info[field]?.date ? utilService.calculateTime(info[field].date) : ''}
                </span>
            </div>
        </section>
    )
}