/**
 * Drop board.cmps_order and board.cmps_option.
 *
 * These held the old column model: a fixed list of picker names, where every
 * type could appear exactly once because each picker read a fixed field on the
 * task. That was replaced by board_column rows, which allow several columns of
 * the same type, renaming, and per-column label lists.
 *
 * The two survived the replacement as a fallback: a board with no
 * board_column rows had its columns derived from cmps_order on every read.
 * That fallback is gone now, and it was checked first — every board in the
 * database has real board_column rows, and both the frontend and the backend
 * write columns directly when a board is created.
 *
 * The down migration puts the columns back, empty. The content is not
 * recoverable, and does not need to be: board_column has held it since the
 * move to MariaDB.
 */
exports.up = async function up(knex) {
    await knex.schema.alterTable('board', t => {
        t.dropColumn('cmps_order')
        t.dropColumn('cmps_option')
    })
}

exports.down = async function down(knex) {
    await knex.schema.alterTable('board', t => {
        t.json('cmps_order')
        t.json('cmps_option')
    })
}
