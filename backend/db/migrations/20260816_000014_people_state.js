/**
 * People are switched off, not deleted.
 *
 * Two tables, the same idea as the bin and the archive, and for a reason that
 * is not sentiment: every table in this database records who did something —
 * who wrote the update, who last touched the task, who created the board — and
 * NOT ONE of them has a foreign key onto `user`. Deleting an account left
 * those ids pointing at nothing, which is exactly why every one of those
 * tables also carries a copy of the name and the picture. Take away the hard
 * delete and the copies have no job left.
 *
 * `user.state`
 *   active    can log in, can be found, is a person
 *   inactive  the account is closed. Everything they wrote stays, with their
 *             name on it, and no one can sign in as them.
 *
 * `board_member.state`
 *   active    a member of the board, with the role in the same row
 *   inactive  was a member. Keeps nothing — no access, no notifications — but
 *             the row stays, so re-inviting somebody restores their history
 *             rather than making a stranger of them.
 *
 * The dangerous half of this is the second one. `board_member` IS the
 * permission source: an inactive row that any query forgets to exclude is
 * somebody who was removed from a board and still reads it. Every place that
 * asks "which boards is this person on" filters on this column, and
 * board.roles.js refuses an inactive member a role even if one reaches it.
 */
const STATES = ['active', 'inactive']

exports.up = async function up(knex){
    await knex.schema.alterTable('user', t => {
        t.enu('state', STATES).notNullable().defaultTo('active')
        t.bigInteger('state_at').nullable()
    })

    await knex.schema.alterTable('board_member', t => {
        t.enu('state', STATES).notNullable().defaultTo('active')
        t.bigInteger('state_at').nullable()
        // The lookup behind "which boards may I see", now that it has a second
        // condition.
        t.index(['user_id', 'state'], 'idx_member_user_state')
    })
}

exports.down = async function down(knex){
    await knex.schema.alterTable('board_member', t => {
        t.dropIndex(['user_id', 'state'], 'idx_member_user_state')
        t.dropColumn('state')
        t.dropColumn('state_at')
    })
    await knex.schema.alterTable('user', t => {
        t.dropColumn('state')
        t.dropColumn('state_at')
    })
}
