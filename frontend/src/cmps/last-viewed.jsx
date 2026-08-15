import { IoTimeOutline } from 'react-icons/io5'
import { GUEST_IMG } from '../services/avatar'
export function LastViewed({ member }) {

    return (
        <div className="last-viewed-main flex space-between">
            <div className="member-info flex align-center">
                <img src={member.imgUrl || GUEST_IMG} alt="" />
                <span>{member.fullname}</span>
            </div>
            {/* Demo */}
            <div className='last-viewed-member'>
                1d
            </div>
        </div>
    )
}