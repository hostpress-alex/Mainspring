/**
 * Three roles per board, and a creator for every group.
 *
 * `board_member.is_owner` said one of two things. It now says one of three, so
 * it becomes a role. The boolean is KEPT and written alongside: the socket
 * layer, the board assembly and a handful of queries read it, and changing the
 * schema and every reader of it in the same step is how a permission change
 * turns into an outage. It is derived from the role from here on — role is the
 * truth, is_owner is a shadow.
 *
 *   owner   the board's frame: name, description, columns, groups, people
 *   editor  everything about tasks, may add groups, may change and delete the
 *           groups it created
 *   viewer  reads everything; writes replies, and edits or deletes only its own
 *
 * `board_group.created_by` is what "a group it created" needs. Existing groups
 * have no honest answer, so they are given the board's first owner: that makes
 * them owner-only, which is the safe end of the guess. Handing a right out
 * later is harmless; taking one away after people have used it is not.
 */
const ROLES = ['owner', 'editor', 'viewer']

exports.up = async function up(knex){
    await knex.schema.alterTable('board_member', t => {
        t.enu('role', ROLES).notNullable().defaultTo('editor')
    })

    // Whoever was an owner stays one. Everybody else becomes an editor, which
    // is what "member" meant until now — nobody loses anything today.
    await knex('board_member').where({is_owner: true}).update({role: 'owner'})
    await knex('board_member').where({is_owner: false}).update({role: 'editor'})

    await knex.schema.alterTable('board_group', t => {
        t.string('created_by', 24).nullable()
        t.index(['board_id', 'created_by'], 'idx_group_creator')
    })

    // The first owner of each board, as the creator of everything that is
    // already there. A subquery rather than a loop in JavaScript: on a board
    // with a thousand groups the loop is a thousand round trips.
    await knex.raw(`
        UPDATE board_group g
        SET g.created_by = (
            SELECT m.user_id FROM board_member m
            WHERE m.board_id = g.board_id AND m.role = 'owner'
            ORDER BY m.position LIMIT 1
        )
        WHERE g.created_by IS NULL
    `)
}

exports.down = async function down(knex){
    await knex.schema.alterTable('board_group', t => {
        t.dropIndex(['board_id', 'created_by'], 'idx_group_creator')
        t.dropColumn('created_by')
    })
    await knex.schema.alterTable('board_member', t => {
        t.dropColumn('role')
    })
}
