/**
 * Original file name.
 *
 * On disk every file is named after its id — unique, but when downloading you
 * then get "a1b2…f9.pdf" instead of "Angebot.pdf".
 */
exports.up = async function up(knex) {
    await knex.schema.alterTable('file', t => {
        t.string('original_name', 255).nullable().after('scope')
    })
}

exports.down = async function down(knex) {
    await knex.schema.alterTable('file', t => {
        t.dropColumn('original_name')
    })
}
