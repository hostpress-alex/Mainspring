import {useEffect, useRef} from 'react'
import {Tooltip} from '@mui/material'

import {markSeen} from './use-comment-seen'
import {Avatar} from '../avatar'
import {Icon} from '../icon'
import {t} from '../../i18n'

/** Half of it on screen, for this long, before it counts as read. */
const VISIBLE_RATIO = 0.5
const DWELL_MS = 1000

/**
 * "Seen by four" under an update, and by whom.
 *
 * What counts as seen is the whole feature. Marking everything as read the
 * moment a task is opened would have been three lines and a lie: with twenty
 * updates in a task, nobody has read twenty updates. So the element has to be
 * half on screen and stay there for a second — scrolling past does not count,
 * and neither does a task opened in a background tab, because
 * IntersectionObserver does not fire for one.
 *
 * The reader's own reading is not recorded; the server drops it. "Seen by 4"
 * that counts the author is a number nobody can do anything with.
 */
export function CommentSeen({boardId, taskId, commentId, authorId, myId, members = [], seen = []}){
    const elRef = useRef(null)

    useEffect(() => {
        const el = elRef.current
        if(!el || !boardId || !taskId || !commentId) return
        // Your own update needs no receipt from you.
        if(myId && authorId && String(myId) === String(authorId)) return
        if(typeof IntersectionObserver === 'undefined') return

        let timer = null
        const observer = new IntersectionObserver(entries => {
            for(const entry of entries){
                if(entry.isIntersecting && entry.intersectionRatio >= VISIBLE_RATIO){
                    if(timer) continue
                    timer = setTimeout(() => {
                        timer = null
                        markSeen(boardId, taskId, commentId, myId)
                        observer.disconnect()
                    }, DWELL_MS)
                } else if(timer){
                    // Scrolled away again before the second was up. That is
                    // exactly the case this delay exists for.
                    clearTimeout(timer)
                    timer = null
                }
            }
        }, {threshold: [VISIBLE_RATIO]})

        observer.observe(el)
        return () => {
            if(timer) clearTimeout(timer)
            observer.disconnect()
        }
    }, [boardId, taskId, commentId, authorId, myId])

    const people = seen.map(entry => {
        const member = members.find(m => m && String(m._id) === String(entry.userId))
        return {
            id: entry.userId,
            name: member?member.fullname:t('update.someone'),
            imgUrl: member?member.imgUrl:''
        }
    })

    return (
        <span className="comment-seen" ref={elRef}>
            {people.length > 0 && (
                <Tooltip arrow disableInteractive title={
                    <span className="comment-seen-list">
                        {people.map(person => (
                            <span className="comment-seen-person" key={person.id}>
                                <Avatar src={person.imgUrl} className="comment-seen-avatar"/>
                                <span>{person.name}</span>
                            </span>
                        ))}
                    </span>
                }>
                    <span className="comment-seen-count" aria-label={t('update.seenBy', {n: people.length})}>
                        <Icon name="eye" variant="fa-regular"/>
                        <span>{people.length}</span>
                    </span>
                </Tooltip>
            )}
        </span>
    )
}
