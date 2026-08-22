/**
 * How much of a task's checklists is ticked off.
 *
 * A checklist in this application is not a structure of its own — it is a
 * tiptap task list inside an **update**, and ticking one already saves through
 * `toggleTaskItem`. That is where the boxes live and where they stay. This
 * file only counts them, so a row in the table can say how far along the task
 * is without anybody opening it.
 *
 * **Every update on the task, added together**, replies included. A task
 * whose work is spread over three updates is one piece of work, and three
 * separate counters in one row would be read as one and be wrong. The count
 * says "of everything on this task, this much is done".
 *
 * Deliberately without a DOM. `toggleTaskItem` next door needs one because it
 * has to write markup back; counting is reading, a `<li>` opening tag holds
 * both facts, and staying DOM-free means this can be exercised in plain node —
 * and costs nothing in a table drawing a hundred rows.
 */

/**
 * An `<li>` opening tag, whatever is in it.
 *
 * Attribute ORDER is not fixed — tiptap writes `data-checked` and `data-type`
 * and neither is promised to come first — so the tag is matched whole and the
 * two attributes are then looked for inside it. A regex spelling out one order
 * silently counts nothing the day that order changes.
 */
const LI_TAG = /<li\b[^>]*>/gi
const IS_TASK_ITEM = /data-type=("|')taskItem\1/i
const IS_CHECKED = /data-checked=("|')true\1/i

/** {total, done} for one piece of markup. */
export function statsOfHtml(html){
    const text = String(html || '')
    let total = 0
    let done = 0
    // Fresh index every call: LI_TAG is a /g regex, and a /g regex keeps
    // lastIndex between calls — without this the second read starts wherever
    // the first stopped and a task looks half empty at random.
    LI_TAG.lastIndex = 0
    let tag
    while((tag = LI_TAG.exec(text)) !== null){
        if(!IS_TASK_ITEM.test(tag[0])) continue
        total++
        if(IS_CHECKED.test(tag[0])) done++
    }
    return {total, done}
}

/**
 * The whole task: `{total, done}`, or **null** when there is no checklist
 * anywhere on it.
 *
 * Null rather than `{total: 0}` on purpose. The row draws nothing for null,
 * and "this task has no checklist" and "this task has a checklist with
 * nothing in it" are different statements — only the second deserves a mark
 * saying zero.
 */
export function checklistOf(task){
    if(!task || !Array.isArray(task.comments)) return null
    let total = 0
    let done = 0
    for(const comment of task.comments){
        const stats = statsOfHtml(comment && comment.txt)
        total += stats.total
        done += stats.done
    }
    return total?{total, done}: null
}

/** 0 … 1, for the filled circle. An empty list is drawn empty, not full. */
export const fractionOf = stats =>
    (stats && stats.total)?stats.done / stats.total:0

export const isComplete = stats =>
    Boolean(stats && stats.total && stats.done === stats.total)
