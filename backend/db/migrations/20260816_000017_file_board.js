/**
 * Which board an upload belongs to.
 *
 * `GET /api/upload/:id` asked for a login and nothing else: any signed-in
 * person holding an id got the file, whatever board it came from. The ids are
 * random and not guessable, which is not a permission — a URL noted down
 * before somebody was taken off a board went on working afterwards.
 *
 * The board could have been reached through `file.task_id` -> `task.board_id`,
 * and that is what the backfill below does. It is not good enough to leave it
 * at that: a task's key is (board_id, id), so a lookup by task id alone is only
 * unique because the ids happen to be random. A permission check may not rest
 * on "happens to be".
 *
 * NULL means the file hangs off no board — profile pictures live in this same
 * table — and those stay readable by anybody who is signed in, which is what
 * an avatar is for.
 */
exports.up = async function up(knex){
    await knex.schema.alterTable('file', t => {
        t.string('board_id', 24).nullable()
        t.index('board_id', 'idx_file_board')
    })

    // One-off, and with the same caveat the column exists to remove: this
    // matches on task_id alone because it is the only link there has ever
    // been. From here on the board is written when the file is saved.
    await knex.raw(`
        UPDATE file f
        JOIN task t ON t.id = f.task_id
        SET f.board_id = t.board_id
        WHERE f.task_id IS NOT NULL AND f.board_id IS NULL
    `)
}

exports.down = async function down(knex){
    await knex.schema.alterTable('file', t => {
        t.dropIndex('board_id', 'idx_file_board')
        t.dropColumn('board_id')
    })
}
