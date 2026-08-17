/**
 * An update can be pinned to the top of a task.
 *
 * A timestamp rather than a boolean, for one reason: several updates may be
 * pinned at once, and then the order between them has to come from somewhere.
 * "Most recently pinned first" is an answer a boolean cannot give, and it
 * costs nothing to store.
 *
 * NULL means not pinned. Not 0 — a task pinned at the epoch and a task that
 * was never pinned would be the same row, and the difference is exactly what
 * is being asked.
 *
 * No index. Comments are read a task at a time, a handful at once, already
 * sorted in JavaScript; an index on a column that is NULL for almost every
 * row would only cost writes.
 */
exports.up = async function up(knex){
    await knex.schema.alterTable('task_comment', t => {
        t.bigInteger('pinned_at').nullable()
    })
}

exports.down = async function down(knex){
    await knex.schema.alterTable('task_comment', t => {
        t.dropColumn('pinned_at')
    })
}
