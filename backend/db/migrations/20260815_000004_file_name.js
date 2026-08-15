/**
 * Urspruenglicher Dateiname.
 *
 * Auf der Platte heisst jede Datei nach ihrer Id — eindeutig, aber beim
 * Herunterladen bekommt man dann "a1b2…f9.pdf" statt "Angebot.pdf".
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
