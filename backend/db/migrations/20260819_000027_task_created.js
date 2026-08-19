/**
 * When a task was created, and by whom.
 *
 * The board has always known when a task was last touched (`updated_at`) and
 * never when it began. That is enough for "what happened recently" and no use
 * at all for "how long has this been sitting here", which is the question a
 * Created column is opened for.
 *
 * Two columns on `task` rather than a lookup into the activity log every time
 * a row is drawn: the log is a list of events that can be trimmed, filtered
 * or lost, and the moment a task began is a property of the task.
 *
 * **The backfill reads that log all the same, once.** Every task created
 * through this application left a `create` entry with a time and a person, so
 * the past can be recovered rather than invented. Tasks with no such entry —
 * anything from the seed data, or from before the log existed — keep NULL,
 * and the column shows a dash for them. A guessed creation date is worse than
 * an admitted gap: it would be believed.
 */
exports.up = async function up(knex){
    await knex.schema.alterTable('task', t => {
        t.bigInteger('created_at').nullable()
        t.string('created_by_id', 24).nullable()
    })

    // The earliest 'create' entry per task. Earliest, not any: a task can be
    // created, deleted and created again under the same id, and the first
    // time is the one the column is about.
    const rows = await knex('activity')
        .where({action: 'create'})
        .whereNotNull('task_id')
        .select('board_id', 'task_id')
        .min({at: 'created_at'})
        .select(knex.raw('MIN(by_user_id) AS by_user_id'))
        .groupBy('board_id', 'task_id')

    for(const row of rows){
        if(!row.at) continue
        await knex('task')
            .where({board_id: row.board_id, id: row.task_id})
            .whereNull('created_at')
            .update({created_at: Number(row.at), created_by_id: row.by_user_id || null})
    }
}

exports.down = async function down(knex){
    await knex.schema.alterTable('task', t => {
        t.dropColumn('created_at')
        t.dropColumn('created_by_id')
    })
}
