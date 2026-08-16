/**
 * Subtasks.
 *
 * A subtask is a task. It lives in the same table and only carries a pointer
 * to the task above it, which is what makes comments, mentions, assignments,
 * files, notifications and the activity log work on a subtask without a line
 * of new code: they all hang off `(board_id, task_id)` and do not care whether
 * that task has a parent.
 *
 * The price is that "all tasks of a group" is no longer the same question as
 * "all rows of that group" — everything that lists a group has to say
 * `parent_id IS NULL` from now on. That is the one thing to get right, and it
 * is why the index below leads with parent_id.
 *
 * `group_id` stays filled on a subtask, set to the group of its parent. It is
 * redundant, and deliberately so: the existing foreign key to `board_group`
 * keeps working, so deleting a group still takes its subtasks with it without
 * relying on two cascades chaining.
 *
 * Only one level. Nothing in the schema forbids a deeper tree — the check for
 * that sits in the service, where it can return a readable error instead of a
 * constraint violation.
 */
exports.up = async function up(knex){
    await knex.schema.alterTable('task', t => {
        t.string('parent_id', 40).nullable()
        t.foreign(['board_id', 'parent_id'])
            .references(['board_id', 'id']).inTable('task')
            .onDelete('CASCADE')
        // Reading the children of one task, in order — the only query this
        // column exists for.
        t.index(['board_id', 'parent_id', 'position'], 'idx_task_parent_pos')
    })
}

exports.down = async function down(knex){
    await knex.schema.alterTable('task', t => {
        t.dropForeign(['board_id', 'parent_id'])
        t.dropIndex(['board_id', 'parent_id', 'position'], 'idx_task_parent_pos')
        t.dropColumn('parent_id')
    })
}
