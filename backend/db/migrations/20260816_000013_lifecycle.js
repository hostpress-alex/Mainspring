/**
 * Nothing is deleted any more. It is put somewhere.
 *
 * One column on each of the three things that can be thrown away, holding one
 * of three words:
 *
 *   active     on the board, as always
 *   archived   put away on purpose, kept for good
 *   trashed    thrown away, and getting it back is one click
 *
 * One column rather than two flags, and one mechanism rather than a separate
 * archive: every read on a board has to filter by this, and two conditions in
 * every query is two chances to write only one of them. The difference between
 * the two words is intent, not machinery.
 *
 * NOT called `archived_at`. That name is taken on `board` and on
 * `task_comment`, where it means the moment the thing was CREATED — the board
 * info dialog prints it under "created at". Reusing it here would produce
 * archived boards dated the day they were made, and nobody would look at this
 * migration for the reason.
 *
 * `state_by` is who did it. A trash somebody has to explain to their team
 * needs a name in it; without one the answer to "who threw this away" is a
 * shrug.
 *
 * ## What is NOT here
 *
 * No cascade. Throwing away a group does not touch its tasks, and throwing
 * away a board does not touch anything. The rule is read at query time: a row
 * counts as visible when it AND all of its parents are active. Getting the
 * group back therefore brings its tasks back with it, without a record of
 * "these went along with it" that would have to stay correct through the third
 * restore. A task somebody threw away by itself stays thrown away, which is
 * exactly what you want and what a cascade cannot express.
 */
const STATES = ['active', 'archived', 'trashed']

/** The three tables and the index each of them wants. */
const TARGETS = [
    {table: 'board', index: null},
    {table: 'board_group', index: ['board_id', 'state']},
    {table: 'task', index: ['board_id', 'state']}
]

exports.up = async function up(knex){
    for(const {table, index} of TARGETS){
        await knex.schema.alterTable(table, t => {
            t.enu('state', STATES).notNullable().defaultTo('active')
            t.bigInteger('state_at').nullable()
            t.string('state_by', 24).nullable()
            if(index) t.index(index, `idx_${table}_state`)
        })
    }
}

exports.down = async function down(knex){
    for(const {table, index} of TARGETS){
        await knex.schema.alterTable(table, t => {
            if(index) t.dropIndex(index, `idx_${table}_state`)
            t.dropColumn('state')
            t.dropColumn('state_at')
            t.dropColumn('state_by')
        })
    }
}
