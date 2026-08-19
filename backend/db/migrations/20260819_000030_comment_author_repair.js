/**
 * Give the updates without an author back the one the log still remembers.
 *
 * Every update written before the fix in `getEmptyComment` went into the
 * database with `by_user_id = NULL`: the draft carried the placeholder's
 * `_id: null` and only the name and the picture were overwritten before it
 * was sent. Those two columns are gone since `drop_name_copies`, so the rows
 * now hold no trace of who wrote them and the screen says "Unbekannt".
 *
 * The activity log is the second witness. Writing an update also writes an
 * entry — `update` for an update, `reply` for a reply — with the task, the
 * time, the first line of the text, and an author that was never broken.
 * Where such an entry is still there, the author can be *read* rather than
 * guessed.
 *
 * Where it is not, nothing happens. The log keeps forty entries per board and
 * throws away the rest, so most of these updates are older than anything that
 * survives. Those rows keep their NULL. An update signed with a plausible
 * name is worse than one signed with none: nobody can tell it was reasoning.
 *
 * The match has to hold in three ways at once — same task, same kind, and the
 * text of the entry has to be the beginning of the text of the update — and
 * it has to name exactly one person. Two candidates that disagree are not a
 * near miss; they are a reason to leave the row alone.
 */

/** An entry from before the update was opened is not about it. */
const WINDOW_BEFORE = 60 * 1000
/** Somebody may write for a while before pressing the button. Not for hours. */
const WINDOW_AFTER = 4 * 60 * 60 * 1000

/** `to_value` is JSON in a text column, and may arrive either way round. */
function unwrap(value){
    if(value === null || value === undefined) return ''
    if(typeof value !== 'string') return String(value)
    try {
        const parsed = JSON.parse(value)
        return parsed === null || parsed === undefined?'':String(parsed)
    } catch(err) {
        return value
    }
}

/**
 * The comparable core of a piece of text.
 *
 * Markup out, then everything that is not a letter or a digit. The log holds
 * what the editor made of the text at the time and the update holds the
 * markup itself: the two agree on the words and disagree on nearly every
 * space between them, and the words are enough to tell one update from
 * another.
 */
function squash(text){
    return String(text || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/[^\p{L}\p{N}]/gu, '')
        .toLowerCase()
        .slice(0, 60)
}

/** Does this entry's first line begin the text of that update? */
function textMatches(commentTxt, activityTo){
    const a = squash(commentTxt)
    const b = squash(activityTo)
    // An update that is only a picture has nothing to compare. It stays NULL.
    if(a.length < 3 || b.length < 3) return false
    return a.startsWith(b) || b.startsWith(a)
}

/**
 * The one person the log names for this update, or nothing.
 *
 * Exported, and tested, because this is the whole decision — everything
 * around it is fetching rows and writing one column.
 */
function pickAuthor(comment, activities){
    const kind = comment.parent_id?'reply':'update'
    // `created_at` is nullable, and an empty one must not read as 1970 -
    // that would put every entry outside the window and match nothing.
    const raw = comment.created_at
    const at = (raw === null || raw === undefined || raw === '')?NaN:Number(raw)
    const authors = new Set()
    for(const activity of activities){
        if(activity.action !== kind) continue
        if(!activity.by_user_id) continue
        if(activity.task_id !== comment.task_id) continue
        if(Number.isFinite(at)){
            const when = Number(activity.created_at)
            if(!Number.isFinite(when)) continue
            if(when < at - WINDOW_BEFORE || when > at + WINDOW_AFTER) continue
        }
        if(!textMatches(comment.txt, unwrap(activity.to_value))) continue
        authors.add(activity.by_user_id)
    }
    return authors.size === 1?[...authors][0]:null
}

exports.up = async function up(knex){
    const orphans = await knex('task_comment')
        .whereNull('by_user_id')
        .select('board_id', 'task_id', 'id', 'parent_id', 'created_at', 'txt')
    if(!orphans.length) return

    const boardIds = [...new Set(orphans.map(c => c.board_id))]
    const activities = await knex('activity')
        .whereIn('board_id', boardIds)
        .whereIn('action', ['update', 'reply'])
        .whereNotNull('by_user_id')
        .select('board_id', 'action', 'task_id', 'created_at', 'by_user_id', 'to_value')

    const byBoard = new Map()
    for(const activity of activities){
        const list = byBoard.get(activity.board_id) || []
        list.push(activity)
        byBoard.set(activity.board_id, list)
    }

    let repaired = 0
    for(const comment of orphans){
        const author = pickAuthor(comment, byBoard.get(comment.board_id) || [])
        if(!author) continue
        await knex('task_comment')
            .where({board_id: comment.board_id, task_id: comment.task_id, id: comment.id})
            .whereNull('by_user_id')
            .update({by_user_id: author})
        repaired++
    }

    // Said either way round: the number that stayed anonymous is the part
    // somebody has to know about, and it is not an error to be hidden.
    console.log(`comment author repair: ${repaired} of ${orphans.length} update(s) recovered from the activity log, ` +
        `${orphans.length - repaired} left without an author (no entry survives for them)`)
}

/**
 * Nothing to undo.
 *
 * This wrote back what the log says happened. Setting those rows to NULL
 * again would not restore a previous state, it would restore a defect — and
 * it could not tell the rows it filled from the ones that were always right.
 */
exports.down = async function down(){
}

module.exports.pickAuthor = pickAuthor
module.exports.squash = squash
module.exports.textMatches = textMatches
module.exports.WINDOW_AFTER = WINDOW_AFTER
