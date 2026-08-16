import {parse} from '../../services/mention'

/**
 * Comment text with its mentions highlighted.
 *
 * Built as React nodes from the parsed pieces, never as an HTML string. The
 * text comes from users, and the moment a mention is rendered by handing
 * markup to dangerouslySetInnerHTML, every comment box in the application
 * becomes a place to inject a script.
 *
 * A mention whose person is no longer on the board still renders — the name
 * was written down at the time, and a comment that silently loses a word is
 * worse than one naming somebody who has left.
 */
export function MentionText({text, members, ...rest}){
    const byId = new Map((Array.isArray(members)?members:[])
        .filter(m => m && m._id).map(m => [String(m._id), m]))

    return (
        <p {...rest}>
            {parse(text).map((part, i) => {
                if(part.type === 'text') return part.value

                // Prefer the current name over the one stored at the time, so
                // a mention follows a rename instead of freezing it.
                const member = byId.get(String(part.id))
                const name = member?member.fullname:part.name
                return (
                    <span key={i} className="mention" title={member?undefined:name}>
                        @{name}
                    </span>
                )
            })}
        </p>
    )
}
