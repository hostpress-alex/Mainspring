/**
 * Where a calendar entry came from.
 *
 * The planner needs to be able to throw away its own work and leave
 * everything else alone. Without a mark on the row it cannot: a block it laid
 * yesterday and an appointment somebody typed in by hand look identical, and
 * a planner that cannot tell them apart either deletes what people wrote or
 * never cleans up after itself.
 *
 *   'manual' — a person put it there. Untouchable, and counted as busy.
 *   'auto'   — the planner put it there. It may move it, shorten it or drop
 *              it on the next run.
 *
 * Existing rows become 'manual', which is what they are.
 *
 * `is_assumed` is the honest half of a decision that was made deliberately:
 * tasks without an estimated duration are planned with a default rather than
 * left out. That makes the calendar look complete when it is partly guessed,
 * so every block built on a guess says so — in the interface and in the
 * count at the end of a run.
 */
exports.up = async function up(knex){
    await knex.schema.alterTable('schedule', t => {
        t.string('source', 10).notNullable().defaultTo('manual')
        t.boolean('is_assumed').notNullable().defaultTo(false)
        // Everything the planner writes in one run carries the same stamp, so
        // a run can be undone or explained as a whole.
        t.bigInteger('planned_at').nullable()
        t.index(['user_id', 'source', 'start_at'], 'idx_schedule_source')
    })
}

exports.down = async function down(knex){
    await knex.schema.alterTable('schedule', t => {
        t.dropIndex(['user_id', 'source', 'start_at'], 'idx_schedule_source')
        t.dropColumn('source')
        t.dropColumn('is_assumed')
        t.dropColumn('planned_at')
    })
}
