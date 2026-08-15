/**
 * Ausgangsschema.
 *
 * Leitgedanke: alles, wonach man sucht, sortiert oder filtert, ist eine echte
 * Spalte. Nur die Werte der frei konfigurierbaren Board-Spalten (Status,
 * Prioritaet, Datum, eigene Text- und Zahlenspalten) liegen zusammen in
 * task.col_values als JSON — sonst braeuchte jede neue Spaltenart eine
 * Schema-Aenderung.
 *
 * Personen-Zuweisungen liegen bewusst NICHT im JSON, sondern in task_member:
 * "welche Tasks hat Person X" ist eine Abfrage, die man wirklich braucht.
 */
exports.up = async function up(knex) {
    await knex.schema.createTable('user', t => {
        t.string('id', 24).primary()
        t.string('username', 190).notNullable().unique()
        t.string('password', 255).notNullable().defaultTo('')
        t.string('fullname', 190).notNullable().defaultTo('')
        t.string('img_url', 500).notNullable().defaultTo('')
        t.boolean('is_admin').notNullable().defaultTo(false)
        t.datetime('created_at').notNullable().defaultTo(knex.fn.now())
    })

    await knex.schema.createTable('board', t => {
        t.string('id', 24).primary()
        t.string('title', 190).notNullable().defaultTo('')
        t.text('description')
        t.string('folder', 190).notNullable().defaultTo('')
        t.boolean('is_starred').notNullable().defaultTo(false)
        // Ersteller: Verweis plus Namenskopie, damit die Anzeige auch nach dem
        // Loeschen des Benutzers noch etwas Sinnvolles zeigt.
        t.string('created_by_id', 24).nullable()
        t.string('created_by_name', 190).notNullable().defaultTo('')
        t.string('created_by_img', 500).notNullable().defaultTo('')
        t.bigInteger('archived_at').nullable()
        t.json('labels')
        t.json('cmps_order')
        t.json('cmps_option')
        t.datetime('created_at').notNullable().defaultTo(knex.fn.now())
        t.index('folder', 'idx_board_folder')
    })

    await knex.schema.createTable('board_member', t => {
        t.string('board_id', 24).notNullable()
        t.string('user_id', 24).notNullable()
        t.boolean('is_owner').notNullable().defaultTo(false)
        t.integer('position').notNullable().defaultTo(0)
        // Kopie aus dem Moment der Einladung — Rueckfall fuer geloeschte Benutzer.
        t.string('fullname', 190).notNullable().defaultTo('')
        t.string('img_url', 500).notNullable().defaultTo('')
        t.primary(['board_id', 'user_id'])
        t.foreign('board_id').references('board.id').onDelete('CASCADE')
        t.index('user_id', 'idx_board_member_user')
    })

    await knex.schema.createTable('board_column', t => {
        t.string('board_id', 24).notNullable()
        t.string('id', 40).notNullable()
        t.integer('position').notNullable().defaultTo(0)
        t.string('type', 40).notNullable().defaultTo('text')
        t.string('title', 190).notNullable().defaultTo('')
        // Unter welchem Schluessel der Wert in task.col_values liegt.
        t.string('field', 80).notNullable().defaultTo('')
        t.json('settings')
        t.primary(['board_id', 'id'])
        t.foreign('board_id').references('board.id').onDelete('CASCADE')
    })

    await knex.schema.createTable('board_group', t => {
        t.string('board_id', 24).notNullable()
        t.string('id', 40).notNullable()
        t.integer('position').notNullable().defaultTo(0)
        t.string('title', 190).notNullable().defaultTo('')
        t.string('color', 20).notNullable().defaultTo('')
        t.bigInteger('archived_at').nullable()
        t.primary(['board_id', 'id'])
        t.foreign('board_id').references('board.id').onDelete('CASCADE')
    })

    await knex.schema.createTable('task', t => {
        t.string('board_id', 24).notNullable()
        t.string('id', 40).notNullable()
        t.string('group_id', 40).notNullable()
        t.integer('position').notNullable().defaultTo(0)
        t.text('title')
        // Werte der Board-Spalten: { "status": "l101", "dueDate": "...", "c_ab12cd34": 7 }
        t.json('col_values')
        t.bigInteger('updated_at').nullable()
        t.string('updated_by_id', 24).nullable()
        t.string('updated_by_img', 500).notNullable().defaultTo('')
        t.primary(['board_id', 'id'])
        t.foreign(['board_id', 'group_id']).references(['board_id', 'id']).inTable('board_group').onDelete('CASCADE')
        t.index(['board_id', 'group_id', 'position'], 'idx_task_group_pos')
    })

    await knex.schema.createTable('task_member', t => {
        t.string('board_id', 24).notNullable()
        t.string('task_id', 40).notNullable()
        t.string('user_id', 24).notNullable()
        t.integer('position').notNullable().defaultTo(0)
        t.primary(['board_id', 'task_id', 'user_id'])
        t.foreign(['board_id', 'task_id']).references(['board_id', 'id']).inTable('task').onDelete('CASCADE')
        t.index('user_id', 'idx_task_member_user')
    })

    await knex.schema.createTable('task_comment', t => {
        t.string('board_id', 24).notNullable()
        t.string('task_id', 40).notNullable()
        t.string('id', 40).notNullable()
        t.integer('position').notNullable().defaultTo(0)
        t.bigInteger('created_at').nullable()
        t.string('by_user_id', 24).nullable()
        t.string('by_user_name', 190).notNullable().defaultTo('')
        t.string('by_user_img', 500).notNullable().defaultTo('')
        t.text('txt')
        t.json('style')
        t.json('attachments')
        t.primary(['board_id', 'task_id', 'id'])
        t.foreign(['board_id', 'task_id']).references(['board_id', 'id']).inTable('task').onDelete('CASCADE')
    })

    await knex.schema.createTable('activity', t => {
        t.bigIncrements('seq').primary()
        t.string('board_id', 24).notNullable()
        t.string('action', 80).notNullable().defaultTo('')
        t.bigInteger('created_at').nullable()
        t.string('by_user_id', 24).nullable()
        t.json('by_member')
        t.string('task_id', 40).nullable()
        t.text('task_title')
        t.json('from_value')
        t.json('to_value')
        t.foreign('board_id').references('board.id').onDelete('CASCADE')
        t.index(['board_id', 'seq'], 'idx_activity_board')
    })

    await knex.schema.createTable('schedule', t => {
        t.string('id', 24).primary()
        t.string('user_id', 24).notNullable()
        t.string('board_id', 24).notNullable()
        t.string('board_title', 190).notNullable().defaultTo('')
        t.string('group_id', 40).notNullable().defaultTo('')
        t.string('group_title', 190).notNullable().defaultTo('')
        t.string('task_id', 40).notNullable().defaultTo('')
        t.text('task_title')
        t.string('color', 20).notNullable().defaultTo('')
        t.datetime('start_at').notNullable()
        t.datetime('end_at').notNullable()
        t.string('note', 500).notNullable().defaultTo('')
        t.datetime('created_at').nullable()
        t.datetime('updated_at').nullable()
        // Wird ein Board geloescht, verschwinden auch die Planungen dazu.
        t.foreign('board_id').references('board.id').onDelete('CASCADE')
        t.index(['user_id', 'start_at'], 'idx_schedule_user_time')
    })
}

exports.down = async function down(knex) {
    for (const table of ['schedule', 'activity', 'task_comment', 'task_member', 'task',
                         'board_group', 'board_column', 'board_member', 'board', 'user']) {
        await knex.schema.dropTableIfExists(table)
    }
}
