import {useEffect} from 'react'
import {useState} from 'react'
import { Icon } from '../icon'
import {useNavigate} from 'react-router-dom'
import {toggleModal, updateTaskAction} from '../../store/board.actions'
import {ActivityPreview} from '../activity-preview'
import {LastViewed} from '../last-viewed'
import {CommentPreview} from '../task/comment-preview'
import {t} from '../../i18n'

/**
 * The name of the task an entry belongs to.
 *
 * The activity carries the title it had at the time. That is a fair record but
 * a poor label: after a rename you would be looking for a task that no longer
 * goes by that name. So the current title wins where the task still exists,
 * and the recorded one is the fallback for tasks that are gone.
 *
 * Titles are trimmed — they come out of a contentEditable and tend to carry
 * trailing line breaks.
 */
function titleOfTask(board, activity){
    const id = activity?.task?.id
    if(!id) return null
    for(const group of board.groups || []){
        const found = (group.tasks || []).find(task => task.id === id)
        if(found) return String(found.title || '').trim() || null
    }
    return String(activity.task.title || '').trim() || null
}

export function BoardActivityModal({board, activityLog}){
    const navigate = useNavigate()
    const [view, setView] = useState(activityLog)
    const [tasks, setTasks] = useState([])

    useEffect(() => {
        loadTasks()
    }, [])

    function onCloseModal(){
        navigate(`/board/${board._id}`)
    }

    function loadTasks(){
        const tasks = board.groups.reduce((acc, group) => {
            acc.push(...group.tasks)
            return acc
        }, [])
        setTasks(tasks)
    }

    async function onRemoveComment(commentId, taskId){
        try {
            const task = tasks.find(task => task.id === taskId)
            const group = board.groups.find(group => {
                return group.tasks.some(task => task.id === taskId)
            })
            task.comments = task.comments.filter(comment => comment.id !== commentId)
            updateTaskAction(board, group.id, task)
        } catch(err) {
            console.log('err:', err)
        }
    }

    async function onEditComment(saveComment, taskId){
        try {
            const task = tasks.find(task => task.id === taskId)
            const group = board.groups.find(group => {
                return group.tasks.some(task => task.id = taskId)
            })
            task.comments = task.comments.map(comment => (comment.id === saveComment.id)?saveComment:comment)
            updateTaskAction(board, group.id, task)
        } catch(err) {
            console.log('err:', err)
        }
    }

    return (
        <section className="board-activity-modal">
            <div className="board-activity-header">
                <Icon name='xmark' className="close-btn" onClick={onCloseModal}/>
                <h3 className="board-title">{board.title} <span>{t('activity.activity')}</span></h3>
                <div className="views flex">
                    <span className={view === 'activity'?'active':''} onClick={() => setView('activity')}>{t('activity.activity')}</span>
                    <span className={view === 'last-viewed'?'active':''} onClick={() => setView('last-viewed')}>{t('activity.lastSeen')}</span>
                    <span className={view === 'updates'?'active':''} onClick={() => setView('updates')}>{t('update.updates')}</span>
                </div>
            </div>
            <div className="board-activity-content">
                {view === 'activity' &&
                    board.activities.map((activity, idx) => {
                        return <li key={idx}>
                            <ActivityPreview activity={activity} taskTitle={titleOfTask(board, activity)}/></li>
                    })
                }
                {view === 'last-viewed' &&
                    <section className="last-viewed">
                        <div className="title flex space-between">
                            <span>{t('common.name')}</span>
                            <span>{t('activity.lastSeen')}</span>
                        </div>

                        {board.members.map(member => {
                            return <li key={member._id}><LastViewed member={member}/></li>
                        })}
                    </section>
                }
                {view === 'updates' &&
                    <section className="update">
                        <div className="comments-list">
                            {tasks.map(task => {
                                return task.comments.map(comment => {
                                    return <li key={comment._id}>
                                        <CommentPreview onRemoveComment={onRemoveComment} comment={comment} onEditComment={onEditComment} taskId={task.id}/>
                                    </li>
                                })

                            })}
                        </div>
                    </section>
                }
            </div>
        </section>
    )
}