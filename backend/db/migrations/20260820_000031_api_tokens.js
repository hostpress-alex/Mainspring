/**
 * Tokens for callers that are not a browser.
 *
 * Deliberately its own table and not a row in `session`. The two look alike
 * and mean opposite things:
 *
 *   a session   is a person at a keyboard. It times out when unused, because
 *               a browser left in a hotel lobby must stop working.
 *   a token     is a script. It may sit unused for six weeks between two runs
 *               and must still work on the seventh — an idle timeout would
 *               turn "the nightly job stopped" into a mystery.
 *
 * Putting both in one table means one of those two rules is wrong for half the
 * rows, and the half it is wrong for is the half nobody notices until it
 * breaks.
 *
 * What is stored is the SHA-256 of the token, exactly as for sessions. A copy
 * of this table is not a set of working keys.
 */
exports.up = async function up(knex){
    await knex.schema.createTable('api_token', t => {
        // The SHA-256 of the token the caller sends, hex.
        t.string('id', 64).notNullable().primary()
        t.string('user_id', 24).notNullable()

        /**
         * What it is for, in somebody's words: "Zeiterfassung Import",
         * "Monitoring". A list of tokens that all read `token` is a list
         * nobody dares to revoke anything from.
         */
        t.string('name', 190).notNullable().defaultTo('')

        /**
         * The first few characters of the token, in the clear.
         *
         * So a token can be told apart in a list, and so a token found in a
         * log or a config file can be matched to its row without anybody
         * having to paste the secret anywhere to find out what it is.
         */
        t.string('prefix', 16).notNullable().defaultTo('')

        t.bigInteger('created_at').notNullable()
        // Who minted it. An admin creates tokens for the integration account,
        // so the owner and the person responsible are usually not the same.
        t.string('created_by_id', 24).nullable()

        // Null until it is used the first time. "Never used" is the answer
        // that says a deployment did not work.
        t.bigInteger('last_used_at').nullable()

        // Optional hard end. Null means "until revoked" — which is what a
        // long-running integration wants, and why this is nullable rather
        // than a default.
        t.bigInteger('expires_at').nullable()

        /**
         * Revoked, not deleted.
         *
         * A deleted row answers "there was never such a token", and the
         * question actually being asked after an incident is "what was this
         * key, whose was it, and when did we take it away".
         */
        t.bigInteger('revoked_at').nullable()

        t.index('user_id', 'idx_api_token_user')
        t.foreign('user_id').references('id').inTable('user').onDelete('CASCADE')
    })
}

exports.down = async function down(knex){
    await knex.schema.dropTableIfExists('api_token')
}
