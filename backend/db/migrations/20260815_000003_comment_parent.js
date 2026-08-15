/**
 * Antworten auf Updates.
 *
 * Ein Kommentar mit parent_id ist eine Antwort auf den Kommentar mit dieser
 * Id. Bewusst nur eine Ebene tief — Antworten auf Antworten liest hinterher
 * niemand mehr.
 *
 * Kein Fremdschluessel auf sich selbst: die Kommentare eines Tasks werden in
 * einem Rutsch geschrieben (erst geloescht, dann neu eingefuegt), und dabei
 * darf die Reihenfolge innerhalb der Transaktion keine Rolle spielen.
 */
exports.up = async function up(knex){
    await knex.schema.alterTable('task_comment', t => {
        t.string('parent_id', 40).nullable().after('id')
        t.index(['board_id', 'task_id', 'parent_id'], 'idx_comment_parent')
    })
}

exports.down = async function down(knex){
    await knex.schema.alterTable('task_comment', t => {
        t.dropIndex(['board_id', 'task_id', 'parent_id'], 'idx_comment_parent')
        t.dropColumn('parent_id')
    })
}
