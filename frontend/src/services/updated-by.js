import {GUEST_IMG} from './avatar'

/**
 * Stamp "somebody just touched this task" onto a copy of the task.
 *
 * Built as a new object, never written into the old one. `updatedBy` is on
 * every task the board form creates, but a task that came in through the API
 * has no such key, and `task.updatedBy.date = Date.now()` threw on those —
 * inside an event handler, before any request was made. The cell showed the
 * new value, the exception was swallowed by the catch around the save, and
 * nothing was ever written. It looked exactly like a silent server refusal,
 * which is why it took a network log to find.
 *
 * The picture is a copy on purpose: the row shows who last touched a task
 * without a second lookup. `_id` is left as it is — the server takes it from
 * the session anyway.
 */
export function touchedBy(task, user){
    return {
        ...((task && task.updatedBy) || {}),
        date: Date.now(),
        imgUrl: (user && user.imgUrl) || GUEST_IMG
    }
}
