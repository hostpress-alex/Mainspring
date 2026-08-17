/**
 * Sessions become rows. The cookie stops being a credential you can mint.
 *
 * Until now the login cookie WAS the user record, encrypted with SECRET1:
 * whoever knew that key could write `{_id: "<an admin's id>", iat: now}`,
 * encrypt it, and be that admin. Every guard added around it — an age, a
 * revocation line, rights read from the row instead of the token — is a
 * condition ON that credential. None of them helps against somebody who can
 * issue new ones.
 *
 * From here the cookie carries a random value that means nothing by itself.
 * The session is the row; no key can produce one.
 *
 * ## Why the id is a hash
 *
 * The cookie holds 32 random bytes. What is stored is their SHA-256. A copy of
 * this table is then not a set of working cookies — the same reason a password
 * column holds a hash. It costs nothing: the lookup is still one indexed read,
 * on the hash instead of the value.
 *
 * SHA-256 without a salt, and deliberately: this is a 256-bit random value, not
 * a password. There is no dictionary to run against it, and per-row salt would
 * make the lookup a table scan.
 *
 * ## `user.sessions_valid_from` goes
 *
 * It was added two hours before this file, and it was the poor man's version
 * of exactly this: a date to compare against because there was nothing to
 * delete. Now there is. Signing out everywhere is a DELETE, and a column
 * nothing reads is the clutter this project has been taking out all day.
 */
exports.up = async function up(knex){
    await knex.schema.createTable('session', t => {
        // The SHA-256 of the value in the cookie, hex.
        t.string('id', 64).notNullable().primary()
        t.string('user_id', 24).notNullable()
        t.bigInteger('created_at').notNullable()
        t.bigInteger('last_seen_at').notNullable()
        t.bigInteger('expires_at').notNullable()
        // What the person will recognise the entry by in their profile. Cut to
        // 255 characters — a user agent is longer than anyone needs and this
        // is display only.
        t.string('user_agent', 255).notNullable().defaultTo('')
        // Long enough for IPv6, which is 45 characters at its longest.
        t.string('ip', 45).notNullable().defaultTo('')
        t.index('user_id', 'idx_session_user')
        t.index('expires_at', 'idx_session_expiry')
        t.foreign('user_id').references('id').inTable('user').onDelete('CASCADE')
    })

    await knex.schema.alterTable('user', t => {
        t.dropColumn('sessions_valid_from')
    })
}

exports.down = async function down(knex){
    await knex.schema.alterTable('user', t => {
        t.bigInteger('sessions_valid_from').nullable()
    })
    await knex.schema.dropTableIfExists('session')
}
