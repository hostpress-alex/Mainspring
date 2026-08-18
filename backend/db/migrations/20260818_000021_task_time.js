/**
 * Time tracking: one row per interval.
 *
 * Somebody starts working, pauses, comes back, stops. That is not one session
 * with holes in it — it is three intervals, and storing it as three rows is
 * what makes the two things anybody ever wants cheap: summing, and correcting
 * a single one of them without touching the rest.
 *
 * `ended_at IS NULL` means running. There is at most one such row per person,
 * which is enforced in the service rather than by a constraint: MySQL has no
 * partial unique index, and a unique key over (user_id, ended_at) would also
 * forbid two closed intervals that happen to end in the same millisecond.
 *
 * `ended_by` keeps pause and stop apart even though the row looks the same.
 * The difference is not in the data, it is in what the interface offers next —
 * but the log has to be able to say which of the two happened, and `auto` has
 * to stand out, because a forgotten timer is a number nobody should trust.
 *
 * The times are what the clock said, unrounded. These figures are for seeing
 * where the day went, not for an invoice; rounding rules would only make them
 * less true.
 */
exports.up = async function up(knex){
    await knex.schema.createTable('task_time', t => {
        t.string('id', 24).notNullable().primary()
        t.string('board_id', 24).notNullable()
        t.string('task_id', 40).notNullable()
        t.string('user_id', 24).notNullable()

        t.bigInteger('started_at').notNullable()
        // NULL = still running.
        t.bigInteger('ended_at').nullable()

        // What the person wrote when they paused or stopped. Optional.
        t.text('note').nullable()

        // 'timer'  — measured by the clock
        // 'manual' — typed in afterwards, because somebody forgot to start it
        t.string('source', 10).notNullable().defaultTo('timer')

        // 'pause' | 'stop' | 'auto', NULL while running.
        t.string('ended_by', 10).nullable()

        t.bigInteger('created_at').nullable()
        t.bigInteger('updated_at').nullable()

        // The two questions that get asked: everything on this task, and
        // what is this person doing right now.
        t.index(['board_id', 'task_id'], 'idx_time_task')
        t.index(['user_id', 'ended_at'], 'idx_time_user_running')

        t.foreign('board_id').references('id').inTable('board').onDelete('CASCADE')
        t.foreign(['board_id', 'task_id']).references(['board_id', 'id']).inTable('task').onDelete('CASCADE')
        t.foreign('user_id').references('id').inTable('user').onDelete('CASCADE')
    })
}

exports.down = async function down(knex){
    await knex.schema.dropTableIfExists('task_time')
}
