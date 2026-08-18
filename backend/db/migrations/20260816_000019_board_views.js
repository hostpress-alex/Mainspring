/**
 * Saved filters, per board.
 *
 * A filter somebody sets on Monday morning is worth keeping; one they worked
 * out over ten minutes is worth sharing. The browser remembers the current
 * one on its own — this table is for the ones that get a name.
 *
 * `rules` is JSON and stays JSON: it is a list of {field, operator, value}
 * that is read whole, written whole and never searched. A table of rule rows
 * would be three joins to answer a question nobody asks.
 *
 * Who may change one is the same rule as for a group: whoever made it, or an
 * owner of the board. Everybody on the board can see and use all of them —
 * a filter is a way of looking, not a secret.
 */
exports.up = async function up(knex){
    await knex.schema.createTable('board_view', t => {
        t.string('id', 24).notNullable().primary()
        t.string('board_id', 24).notNullable()
        t.string('title', 190).notNullable().defaultTo('')
        // 'all' or 'any' — whether every rule has to match or just one.
        t.string('mode', 10).notNullable().defaultTo('all')
        t.json('rules').notNullable()
        t.string('created_by', 24).nullable()
        t.bigInteger('created_at').nullable()
        t.bigInteger('updated_at').nullable()
        t.index(['board_id', 'title'], 'idx_view_board')
        t.foreign('board_id').references('id').inTable('board').onDelete('CASCADE')
        t.foreign('created_by').references('id').inTable('user').onDelete('SET NULL')
    })
}

exports.down = async function down(knex){
    await knex.schema.dropTableIfExists('board_view')
}
