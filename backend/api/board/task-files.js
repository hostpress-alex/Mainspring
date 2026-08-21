/**
 * Which uploaded files a task still points at.
 *
 * A file can reach a task by three different routes, and none of them is a
 * foreign key:
 *
 *   - as an attachment under an update  -> comment.attachments[].{_id,url}
 *   - as an image inside an update      -> <img src="/api/upload/<id>"> in the text
 *   - as the value of a file column     -> col_values[field] = {url} (or a bare url)
 *
 * Nothing ever deletes a `file` row — `fileService.remove` had no caller at
 * all until the files tab — so the table holds every upload that was ever made
 * against this task, including the ones somebody dropped from a draft before
 * posting it. Telling those apart is what this file is for.
 *
 * Pure, and deliberately mirrored by `frontend/src/services/task-files.js`.
 * The frontend needs the same answer to draw the tab; the server needs it to
 * refuse a delete. A client that works it out wrongly must not be able to
 * remove a file that is still in use, so the copy here is the one that
 * decides. Change one and change the other — `test/task-files.test.js` holds
 * the cases both have to agree on.
 */

/**
 * The id in an upload URL.
 *
 * Ids are 32 hex characters (`file.service.save`). Anchored on the route
 * rather than searching for hex anywhere, so a task whose text happens to
 * contain a long hex string does not pin a file that was never there.
 */
const URL_ID = /\/api\/upload\/([a-f0-9]{32})/gi

/** One id out of whatever shape a value has: an object, a bare url, an id. */
function idOf(value){
    if(!value) return null
    if(typeof value === 'string'){
        if(/^[a-f0-9]{32}$/i.test(value)) return value.toLowerCase()
        URL_ID.lastIndex = 0
        const found = URL_ID.exec(value)
        return found?found[1].toLowerCase():null
    }
    if(typeof value !== 'object') return null
    // `_id` first: it is what the upload returned and what the attachment was
    // built from. The url is the fallback for anything older.
    return idOf(value._id) || idOf(value.url)
}

/** Every id mentioned in a piece of markup. */
function idsInText(html){
    const out = []
    if(!html || typeof html !== 'string') return out
    URL_ID.lastIndex = 0
    let found
    while((found = URL_ID.exec(html)) !== null) out.push(found[1].toLowerCase())
    return out
}

/**
 * Where each file is used.
 *
 * Returns a Map from file id to a list of places. A file can be in more than
 * one — the same image pasted into two updates is one row in `file` and two
 * sources — so the value is a list and not a single answer.
 *
 * `comments` are `{id, txt, attachments}`, `fileFields` are the `field` names
 * of the board's file columns, `colValues` is the task's JSON.
 */
function sourcesOf({comments = [], colValues = {}, fileFields = []} = {}){
    const out = new Map()
    const add = (id, source) => {
        if(!id) return
        const list = out.get(id)
        if(list) list.push(source)
        else out.set(id, [source])
    }

    for(const comment of comments || []){
        if(!comment) continue
        for(const attachment of comment.attachments || []){
            add(idOf(attachment), {kind: 'attachment', commentId: comment.id || null})
        }
        for(const id of idsInText(comment.txt)){
            add(id, {kind: 'text', commentId: comment.id || null})
        }
    }

    for(const field of fileFields || []){
        add(idOf((colValues || {})[field]), {kind: 'column', field})
    }

    return out
}

/** Just the ids, for the one question the delete route asks. */
function referencedIds(task){
    return new Set(sourcesOf(task).keys())
}

/** Is this file still pointed at from anywhere in the task? */
function isReferenced(task, fileId){
    return referencedIds(task).has(String(fileId || '').toLowerCase())
}

module.exports = {sourcesOf, referencedIds, isReferenced, idOf, idsInText}
