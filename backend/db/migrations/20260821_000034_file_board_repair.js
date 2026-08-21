/**
 * Fill in the board on the uploads that never got one.
 *
 * `000017` added `file.board_id`, backfilled it once and said "from here on
 * the board is written when the file is saved". It was not. The upload
 * controller read `scope`, `taskId` and `name` out of the query string and
 * dropped `boardId`, so every file uploaded since that day carries NULL —
 * while the column, the frontend, `README.md` and `DATABASE.md` all said
 * otherwise.
 *
 * Two things followed from it, and the second is the serious one:
 *
 *   - the files tab on a task found nothing, because it looks a task's
 *     uploads up by board and task together;
 *   - NULL means "belongs to no board", and a file that belongs to no board is
 *     readable by anybody signed in. Profile pictures are meant to be. Four
 *     days of task attachments were not.
 *
 * So this is the same backfill as `000017`, run again for the rows written
 * since — but with the caveat that migration named and then ignored. A task's
 * key is `(board_id, id)`; a match on `task_id` alone is unique only because
 * the ids happen to be random, and a permission may not rest on "happens to
 * be". Where two tasks in different boards share an id, **neither** file is
 * assigned: the row keeps its NULL and stays as visible as it already was,
 * rather than being handed to the wrong board's members.
 *
 * Files with no `task_id` at all — profile pictures — are not touched. They
 * belong to no board on purpose.
 */
exports.up = async function up(knex){
    // Task ids that appear in more than one board. Almost certainly none, and
    // the check costs one grouped read of a small table.
    const ambiguous = await knex('task')
        .select('id')
        .count({n: '*'})
        .groupBy('id')
        .having(knex.raw('count(*) > 1'))
    const skip = new Set(ambiguous.map(row => String(row.id)))

    const rows = await knex('file')
        .whereNull('board_id')
        .whereNotNull('task_id')
        .select('id', 'task_id')
    if(!rows.length) return

    let filled = 0
    for(const row of rows){
        if(skip.has(String(row.task_id))) continue
        const task = await knex('task').where({id: row.task_id}).first('board_id')
        if(!task || !task.board_id) continue
        await knex('file').where({id: row.id}).update({board_id: task.board_id})
        filled++
    }

    const left = rows.length - filled
    console.log(`file board repair: ${filled} file(s) given their board`
        + (left?`, ${left} left alone (no task row, or the task id is not unique)`:''))
}

/**
 * Nothing to undo.
 *
 * Clearing the column again would not restore a state worth having — it would
 * make those files readable by everybody signed in a second time. `000017`
 * owns the column and its down() drops it.
 */
exports.down = async function down(){
}
