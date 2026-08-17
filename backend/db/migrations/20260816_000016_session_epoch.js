/**
 * A line under everything signed before this moment.
 *
 * The login cookie is the user record, encrypted. There is no session table,
 * so there is nothing to delete when somebody wants to be signed out — and
 * `logout` only clears the cookie in the browser it was clicked in. A copy of
 * the value went on working.
 *
 * `sessions_valid_from` is the missing revocation, in one column: a token
 * issued before this moment is refused. That is what "sign out everywhere"
 * writes, and what a password change writes on its own — a password you
 * changed because somebody else knew it is not much use while their tab is
 * still open.
 *
 * NULL means "nothing has been revoked", which is every account today.
 */
exports.up = async function up(knex){
    await knex.schema.alterTable('user', t => {
        t.bigInteger('sessions_valid_from').nullable()
    })
}

exports.down = async function down(knex){
    await knex.schema.alterTable('user', t => {
        t.dropColumn('sessions_valid_from')
    })
}
