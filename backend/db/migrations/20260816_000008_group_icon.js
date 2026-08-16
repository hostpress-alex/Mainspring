/**
 * A symbol for a group.
 *
 * One emoji in front of the group title. Stored as the characters themselves
 * rather than a name from some list: an emoji is text, every platform already
 * knows how to draw it, and nothing has to be kept in step with a catalogue.
 *
 * 16 characters, not 4. A single visible emoji can be several code points —
 * a flag is two, a skin tone adds one, and "family" runs to seven joined by
 * zero-width joiners. Four would have silently cut those in half and stored
 * something that renders as two unrelated pictures.
 *
 * The column carries the utf8mb4 collation explicitly. On a database whose
 * default is still utf8mb3 an emoji is not merely mangled, the INSERT fails —
 * so this says so rather than depending on how the server was set up.
 */
exports.up = async function up(knex){
    await knex.schema.alterTable('board_group', t => {
        t.string('icon', 16).notNullable().defaultTo('')
            .collate('utf8mb4_unicode_ci')
    })
}

exports.down = async function down(knex){
    await knex.schema.alterTable('board_group', t => {
        t.dropColumn('icon')
    })
}
