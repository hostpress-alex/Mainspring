/**
 * Who has seen an update or a reply.
 *
 * One row is one person having had one comment on screen. There is no
 * "unseen" — a row is written once and never removed, because the fact it
 * records cannot be undone. The counterpart of that: nothing here is ever
 * updated either, so a second look does not move the time.
 *
 * **No foreign key onto `task_comment`, and it is the same trap as with the
 * reactions.** Writing a task rewrites its comments: `syncTaskComments`
 * deletes every row of that task and inserts them again with the same ids. A
 * cascade from here would quietly empty this table every time somebody edited
 * a task — days after anybody read anything. So the link is by id alone, and
 * rows that no longer point at a comment are cleared inside that same sync.
 *
 * Deliberately no device, no user agent, no address. It was asked for and
 * turned down: the useful part is *that* somebody read it, and everything
 * else is a record about a colleague that nobody needs to keep.
 */
exports.up = async function up(knex){
    await knex.schema.createTable('comment_seen', t => {
        t.string('board_id', 24).notNullable()
        t.string('task_id', 40).notNullable()
        t.string('comment_id', 40).notNullable()
        t.string('user_id', 24).notNullable()
        t.bigInteger('seen_at').nullable()

        t.primary(['board_id', 'task_id', 'comment_id', 'user_id'])
        // "Everything on this task" is the only read there is.
        t.index(['board_id', 'task_id'], 'idx_seen_task')

        t.foreign('board_id').references('id').inTable('board').onDelete('CASCADE')
        t.foreign('user_id').references('id').inTable('user').onDelete('CASCADE')
    })
}

exports.down = async function down(knex){
    await knex.schema.dropTableIfExists('comment_seen')
}
