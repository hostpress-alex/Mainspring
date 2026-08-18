/**
 * A saved filter becomes a tab.
 *
 * Two things a chip in a filter panel did not need and a tab does:
 *
 * `display` — which way the board is drawn under this tab: table, kanban or
 * dashboard. Deliberately NOT the existing `mode` column, which says whether
 * every rule has to match or just one. Two different questions, two columns;
 * one column answering both is how a tab ends up drawn as a kanban because
 * somebody wanted `any`.
 *
 * `visibility` — a chip inside a panel is a private matter, a tab across the
 * top of the board is not. Everything anybody saves would otherwise appear
 * for everybody on the board, and the strip would be unusable within a week.
 * Private by default; sharing is a deliberate act, and one that needs write
 * rights on the board.
 */
exports.up = async function up(knex){
    await knex.schema.alterTable('board_view', t => {
        t.string('display', 16).notNullable().defaultTo('table')
        t.string('visibility', 10).notNullable().defaultTo('private')
    })

    // The handful that exist were saved when every view was shared.
    await knex('board_view').update({visibility: 'board'})
}

exports.down = async function down(knex){
    await knex.schema.alterTable('board_view', t => {
        t.dropColumn('display')
        t.dropColumn('visibility')
    })
}
