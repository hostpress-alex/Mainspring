/**
 * The copied names and pictures go.
 *
 * Every table that records who did something kept a copy of their name and
 * their avatar next to the id. Those copies were correct on the day they were
 * written and wrong from the next profile edit onwards — one person could show
 * four different faces on one screen, because `board_member` was refreshed on
 * read and the other four were not.
 *
 * They exist for one reason: nothing has a foreign key onto `user`, and
 * accounts could be deleted, so an id could end up pointing at nothing. The
 * migration before this one takes the delete away. With that gone the copies
 * have no job, and the name is looked up when it is read.
 *
 * ## Order matters
 *
 * The dangling ids are cleaned FIRST, then the keys are added. An ALTER TABLE
 * that adds a foreign key to a table already holding an id nobody knows fails
 * halfway, and half a migration is worse than none.
 *
 * ## Which keys, and which not
 *
 * Only nullable author columns, with ON DELETE SET NULL: they say "somebody
 * wrote this and that somebody may one day not exist". `board_member.user_id`
 * is part of the primary key and cannot be null, and `notification.user_id` is
 * the recipient — a notification for nobody is not a thing. Those two are left
 * to the application, which no longer deletes anybody.
 */

/** Author columns: table, column, and how the key shall be called. */
const AUTHORS = [
    {table: 'board', column: 'created_by_id', key: 'fk_board_creator'},
    {table: 'task', column: 'updated_by_id', key: 'fk_task_updater'},
    {table: 'task_comment', column: 'by_user_id', key: 'fk_comment_author'},
    {table: 'activity', column: 'by_user_id', key: 'fk_activity_author'},
    {table: 'notification', column: 'actor_id', key: 'fk_notification_actor'}
]

/** The copies themselves. */
const COPIES = [
    {table: 'board', columns: ['created_by_name', 'created_by_img']},
    {table: 'board_member', columns: ['fullname', 'img_url']},
    {table: 'task', columns: ['updated_by_img']},
    {table: 'task_comment', columns: ['by_user_name', 'by_user_img']},
    {table: 'activity', columns: ['by_member']},
    {table: 'notification', columns: ['actor_name', 'actor_img']}
]

exports.up = async function up(knex){
    // 1. Anything pointing at an account that is not there is set to NULL.
    //    Those rows keep their text and lose a name nobody could resolve
    //    anyway — the copy they had was the only thing standing in for it.
    for(const {table, column} of AUTHORS){
        await knex(table)
            .whereNotNull(column)
            .whereNotIn(column, knex('user').select('id'))
            .update({[column]: null})
    }

    // 2. Now the database can hold the rule instead of a comment.
    for(const {table, column, key} of AUTHORS){
        await knex.schema.alterTable(table, t => {
            t.foreign(column, key).references('id').inTable('user').onDelete('SET NULL')
        })
    }

    // 3. And the copies are dead weight.
    for(const {table, columns} of COPIES){
        await knex.schema.alterTable(table, t => {
            for(const column of columns) t.dropColumn(column)
        })
    }
}

exports.down = async function down(knex){
    for(const {table, columns} of COPIES){
        await knex.schema.alterTable(table, t => {
            for(const column of columns){
                if(column === 'by_member') t.json(column)
                else if(column.endsWith('_img') || column === 'img_url') t.string(column, 500).notNullable().defaultTo('')
                else t.string(column, 190).notNullable().defaultTo('')
            }
        })
    }
    for(const {table, column, key} of AUTHORS){
        await knex.schema.alterTable(table, t => {
            t.dropForeign(column, key)
        })
    }
}
