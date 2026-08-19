/**
 * Calendar entries that come from somewhere else.
 *
 * Two tables, and the split matters: `calendar_link` says whose Google
 * account a person is, `external_event` is the copy of what was found there.
 * Deleting the link therefore does not have to delete the events, and a sync
 * that fails leaves the last good copy on screen instead of an empty week.
 *
 * **Nothing here is ever written back.** The events are a read-only mirror:
 * the application never edits, moves or creates anything in Google, and the
 * interface refuses to let anybody try. That is not only a permission
 * decision — the scope the server asks for is `calendar.readonly`, so a bug
 * that tried would be refused by Google as well.
 *
 * `external_id` is the event id as Google issues it, and it is the key: a
 * sync must be able to run twice and change nothing. Recurring events are
 * fetched already expanded (singleEvents=true), so each occurrence arrives
 * with an id of its own and this stays true for them too.
 */
exports.up = async function up(knex){
    await knex.schema.createTable('calendar_link', t => {
        t.string('user_id', 24).notNullable().primary()
        // Only 'google' today. Named rather than assumed, so a second source
        // does not need a migration to be told apart.
        t.string('provider', 20).notNullable().defaultTo('google')
        // The address the server impersonates. Not necessarily the address
        // somebody signs in to Mainspring with.
        t.string('external_email', 190).notNullable()
        t.boolean('is_enabled').notNullable().defaultTo(true)
        t.bigInteger('last_sync_at').nullable()
        // The last thing that went wrong, in plain text, so the admin screen
        // can show why a calendar is empty instead of just showing nothing.
        t.string('last_error', 500).nullable()
        t.bigInteger('created_at').nullable()

        t.foreign('user_id').references('id').inTable('user').onDelete('CASCADE')
    })

    await knex.schema.createTable('external_event', t => {
        t.string('user_id', 24).notNullable()
        t.string('provider', 20).notNullable().defaultTo('google')
        t.string('external_id', 190).notNullable()

        t.string('calendar_id', 190).notNullable().defaultTo('')
        t.string('title', 300).notNullable().defaultTo('')
        t.dateTime('start_at').notNullable()
        t.dateTime('end_at').notNullable()
        // A day-long event has no time of day worth showing; the grids draw
        // it as a band rather than a block.
        t.boolean('is_all_day').notNullable().defaultTo(false)
        // 'confirmed' | 'tentative'. Cancelled ones are deleted, not stored.
        t.string('status', 20).notNullable().defaultTo('confirmed')
        t.bigInteger('updated_at').nullable()

        t.primary(['user_id', 'provider', 'external_id'])
        // The only read there is: one person's window.
        t.index(['user_id', 'start_at'], 'idx_external_event_window')
        t.foreign('user_id').references('id').inTable('user').onDelete('CASCADE')
    })
}

exports.down = async function down(knex){
    await knex.schema.dropTableIfExists('external_event')
    await knex.schema.dropTableIfExists('calendar_link')
}
