/**
 * Notifications, and the subscriptions that decide who gets them.
 *
 * Two tables, because they answer two different questions.
 *
 * `notification` is delivery: one row per recipient per event. Fanning out on
 * write rather than working it out on read costs a handful of rows and buys
 * the thing that actually matters — a read state per person. Working it out on
 * read would mean storing "seen up to here" per user and losing the ability to
 * mark one entry read without the ones around it.
 *
 * `task_subscription` is interest: who wants to hear about a task at all.
 * Without it the only honest answer to "who should know" is "everyone on the
 * board", and that is how a notification list turns into something nobody
 * reads. Being assigned or writing an update subscribes you automatically;
 * `muted` is the explicit no.
 *
 * Why `muted` exists rather than deleting the row: a deleted row cannot be
 * told apart from never having been subscribed, so the next assignment would
 * quietly sign you up again to the thing you just switched off.
 */
exports.up = async function up(knex) {
    await knex.schema.createTable('notification', t => {
        t.bigIncrements('seq').primary()

        // Who receives it. Not a foreign key on purpose: a user row can be
        // deleted while their notifications are still being read from a
        // session, and losing the list is worse than a dangling id.
        t.string('user_id', 24).notNullable()

        // Who caused it. Null for anything the system raises by itself.
        t.string('actor_id', 24).nullable()
        t.string('actor_name', 190).notNullable().defaultTo('')
        t.string('actor_img', 500).notNullable().defaultTo('')

        // assigned | invited | value | comment
        t.string('kind', 40).notNullable()

        t.string('board_id', 24).notNullable()
        t.string('board_title', 190).notNullable().defaultTo('')
        t.string('task_id', 40).nullable()

        // A copy of the title as it read at the time. The task may be renamed
        // or deleted later, and a notification about something that no longer
        // exists should still say what it was about.
        t.text('subject')

        // Whatever the kind needs: the column that changed and its old and new
        // value, or the first line of a comment. Read only for display, never
        // searched — which is why it is JSON and not its own table.
        t.json('detail')

        t.bigInteger('created_at').notNullable()
        t.bigInteger('read_at').nullable()

        // The two queries that exist: this user's list, newest first, and the
        // unread count for the badge.
        t.index(['user_id', 'seq'], 'idx_notification_user')
        t.index(['user_id', 'read_at'], 'idx_notification_unread')
        t.foreign('board_id').references('board.id').onDelete('CASCADE')
    })

    await knex.schema.createTable('task_subscription', t => {
        t.string('board_id', 24).notNullable()
        t.string('task_id', 40).notNullable()
        t.string('user_id', 24).notNullable()
        t.boolean('muted').notNullable().defaultTo(false)
        t.bigInteger('created_at').notNullable()

        t.primary(['board_id', 'task_id', 'user_id'])
        t.index(['board_id', 'task_id'], 'idx_subscription_task')
        t.foreign(['board_id', 'task_id']).references(['board_id', 'id']).inTable('task').onDelete('CASCADE')
    })
}

exports.down = async function down(knex) {
    await knex.schema.dropTableIfExists('task_subscription')
    await knex.schema.dropTableIfExists('notification')
}
