/**
 * Metadata of the uploaded files.
 *
 * The file itself sits on disk under backend/uploads/…; this table only
 * records where it is and who it belongs to. The id is the same one that appears
 * in the delivery path /api/upload/<id> — 32 hex characters.
 */
exports.up = async function up(knex){
    await knex.schema.createTable('file', t => {
        t.string('id', 32).primary()
        t.string('rel_path', 500).notNullable()
        t.string('mime', 100).notNullable().defaultTo('')
        t.bigInteger('size').notNullable().defaultTo(0)
        t.string('scope', 40).notNullable().defaultTo('misc')
        t.string('task_id', 40).nullable()
        t.string('uploaded_by_id', 24).nullable()
        t.string('uploaded_by_name', 190).nullable()
        t.datetime('created_at').notNullable()
        t.index('task_id', 'idx_file_task')
        t.index('uploaded_by_id', 'idx_file_user')
    })
}

exports.down = async function down(knex){
    await knex.schema.dropTableIfExists('file')
}
