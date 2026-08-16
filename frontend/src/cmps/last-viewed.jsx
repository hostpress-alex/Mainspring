import { Icon } from './icon'
import { Avatar } from './avatar'

export function LastViewed({member}){

    return (
        <div className="last-viewed-main flex space-between">
            <div className="member-info flex align-center">
                <Avatar src={member.imgUrl} alt=""/>
                <span>{member.fullname}</span>
            </div>
            {/* Demo */}
            <div className="last-viewed-member">
                1d
            </div>
        </div>
    )
}