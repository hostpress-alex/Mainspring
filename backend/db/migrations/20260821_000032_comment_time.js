/**
 * Which time entry an update came out of.
 *
 * Stopping a timer can post its note as an update on the task. Until now that
 * update was an ordinary comment with no idea where it came from, so the one
 * thing everybody wants to see beside it — how long that work took — was not
 * available without guessing from timestamps.
 *
 * **The reference, not the number.** Storing the duration on the comment would
 * be a copy, and this project has paid for copies twice already: the author
 * name on a comment (dropped in 000015, and round 27 spent a migration
 * recovering what was lost with it) and the board title on a schedule entry.
 * A time entry can be corrected afterwards — that is what the edit route is
 * for — and an update saying "2 h" beside an entry that now says "1 h 30" is
 * worse than an update saying nothing, because one of the two is believed.
 *
 * Nullable, and it will be null for almost every row: only updates the timer
 * posted have one.
 *
 * `ON DELETE SET NULL` rather than CASCADE. Deleting a time entry must not
 * delete the text somebody wrote — the words were theirs, the measurement was
 * the machine's. The update stays and simply stops showing a duration.
 */
/**
 * How far apart the update and the end of the entry may be.
 *
 * `postAsUpdate` writes the comment immediately after the entry is closed, so
 * in practice this is under a second. Two minutes is room for a slow write and
 * nothing more — wide enough and it starts matching the NEXT entry on the same
 * task with the same note.
 */
const WINDOW_MS = 2 * 60 * 1000

/**
 * Connect the updates that already exist to the entries they came from.
 *
 * Same doctrine as the comment author repair in round 27: match on evidence,
 * and write nothing where the evidence is not conclusive. An update is linked
 * only when
 *
 *   - it is on the same board and task as the entry,
 *   - its text is EXACTLY the entry's note (postAsUpdate copies it verbatim —
 *     no markup, no trimming beyond what was already stored),
 *   - it was written within WINDOW_MS of the entry being closed,
 *   - and exactly ONE entry fits.
 *
 * Two entries with the same note two minutes apart cannot be told apart, so
 * neither is chosen. A wrong duration on an update is worse than none: it
 * would be believed, and there is nothing on screen to check it against.
 */
async function backfill(knex){
    const candidates = await knex('task_comment as c')
        .join('task_time as tt', function(){
            this.on('tt.board_id', 'c.board_id')
                .andOn('tt.task_id', 'c.task_id')
        })
        .whereNull('c.time_id')
        .whereNotNull('tt.ended_at')
        .whereNotNull('c.created_at')
        .whereRaw('tt.note = c.txt')
        .whereRaw('ABS(c.created_at - tt.ended_at) <= ?', [WINDOW_MS])
        .select('c.board_id', 'c.id as comment_id', 'tt.id as time_id')

    // Anything a second entry also fits is left alone, in both directions: one
    // comment matching two entries, and one entry matching two comments.
    const perComment = new Map()
    const perTime = new Map()
    for(const row of candidates){
        const commentKey = row.board_id + ' ' + row.comment_id
        perComment.set(commentKey, (perComment.get(commentKey) || 0) + 1)
        perTime.set(row.time_id, (perTime.get(row.time_id) || 0) + 1)
    }

    let linked = 0
    for(const row of candidates){
        if(perComment.get(row.board_id + ' ' + row.comment_id) !== 1) continue
        if(perTime.get(row.time_id) !== 1) continue
        await knex('task_comment')
            .where({board_id: row.board_id, id: row.comment_id})
            .update({time_id: row.time_id})
        linked++
    }

    const ambiguous = candidates.length - linked
    console.log(`comment/time link: ${linked} update(s) connected to their time entry`
        + (ambiguous?`, ${ambiguous} left alone (more than one entry fits)`:''))
}

exports.up = async function up(knex){
    await knex.schema.alterTable('task_comment', t => {
        t.string('time_id', 24).nullable()
        t.foreign('time_id').references('id').inTable('task_time').onDelete('SET NULL')
    })
    await backfill(knex)
}

exports.down = async function down(knex){
    await knex.schema.alterTable('task_comment', t => {
        t.dropForeign('time_id')
        t.dropColumn('time_id')
    })
}
