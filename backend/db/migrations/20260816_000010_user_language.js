/**
 * The language a person reads the interface in.
 *
 * It was already switchable — the setting lived in localStorage, which means
 * it lived in one browser. Log in somewhere else and the app is German again.
 * "In his profile" means the account, so the account is where it goes.
 *
 * localStorage does not disappear; it becomes a cache. The interface has to
 * pick a language before React renders and before any request comes back, and
 * reading it from the account at that moment would mean a flash of the wrong
 * one. So: the column is the truth, the browser keeps a copy, and login writes
 * the copy.
 *
 * Empty means "not chosen" — follow the browser, exactly as before. That is
 * different from choosing English, and a nullable column would have made the
 * two indistinguishable from the JavaScript side, where null and '' both come
 * out falsy.
 *
 * 5 characters, not 2: 'de' today, but 'pt-BR' is the shape of the next one,
 * and widening a column later is a migration nobody plans for.
 */
exports.up = async function up(knex){
    await knex.schema.alterTable('user', t => {
        t.string('language', 5).notNullable().defaultTo('')
    })
}

exports.down = async function down(knex){
    await knex.schema.alterTable('user', t => {
        t.dropColumn('language')
    })
}
