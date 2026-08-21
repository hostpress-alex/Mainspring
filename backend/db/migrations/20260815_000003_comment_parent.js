/**
 * Replies to updates.
 *
 * A comment with a parent_id is a reply to the comment with that id. One level
 * deep on purpose — nobody reads replies to replies afterwards.
 *
 * No foreign key onto itself: a task's comments are written in one go (deleted
 * first, then inserted again), and the order inside that transaction must not
 * matter.
 */
exports.up = async function up(knex){
    await knex.schema.alterTable('task_comment', t => {
        t.string('parent_id', 40).nullable().after('id')
        t.index(['board_id', 'task_id', 'parent_id'], 'idx_comment_parent')
    })
}

exports.down = async function down(knex){
    await knex.schema.alterTable('task_comment', t => {
        t.dropIndex(['board_id', 'task_id', 'parent_id'], 'idx_comment_parent')
        t.dropColumn('parent_id')
    })
}
