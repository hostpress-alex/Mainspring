/**
 * Reactions on an update or a reply.
 *
 * One row is one person giving one emoji to one comment. The key is all four
 * of those together, so the same person can add a thumb AND a tick, and cannot
 * add the same thumb twice — clicking it again removes the row instead.
 *
 * **No foreign key onto `task_comment`, on purpose.** Writing a task rewrites
 * its comments: `syncTaskComments` deletes every row for that task and inserts
 * them again with the same ids. A cascade from here would take every reaction
 * with it, at an unpredictable moment, days after anybody reacted — the ids
 * survive that rewrite, the rows would not. So the link is by id alone, and
 * the rows that no longer point at anything are cleared inside that same sync.
 *
 * `board_id` does carry a cascade: a deleted board really is gone, and nothing
 * rewrites boards wholesale.
 */
exports.up = async function up(knex){
    await knex.schema.createTable('comment_reaction', t => {
        t.string('board_id', 24).notNullable()
        t.string('task_id', 40).notNullable()
        t.string('comment_id', 40).notNullable()
        t.string('user_id', 24).notNullable()
        // Short: the set is fixed in the frontend, and a column that fits any
        // emoji sequence is an invitation to store a paragraph in it.
        t.string('emoji', 16).notNullable()
        t.bigInteger('created_at').nullable()

        t.primary(['board_id', 'comment_id', 'user_id', 'emoji'])
        // "Everything on this task" is the only read there is.
        t.index(['board_id', 'task_id'], 'idx_reaction_task')

        t.foreign('board_id').references('id').inTable('board').onDelete('CASCADE')
        t.foreign('user_id').references('id').inTable('user').onDelete('CASCADE')
    })
}

exports.down = async function down(knex){
    await knex.schema.dropTableIfExists('comment_reaction')
}
