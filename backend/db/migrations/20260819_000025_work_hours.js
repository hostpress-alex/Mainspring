/**
 * When people work.
 *
 * One row per person per weekday, and a missing row means a free day. That is
 * the whole model, and the alternatives are worth naming because they look
 * more capable and are not:
 *
 *   - A single "hours per week" number cannot shade a calendar, and shading
 *     the calendar is half of what this is for.
 *   - Times as strings ("09:00") sort and subtract badly in three languages.
 *     Minutes since midnight are one integer, compare correctly, and turn
 *     into any display format without parsing anything.
 *   - Validity ranges (this schedule from March, that one from September)
 *     would let the past stay correct after somebody changes their hours.
 *     Deliberately left out: it doubles every query in this feature, and
 *     nobody has asked what last spring's capacity was. If that day comes,
 *     the migration is an added `valid_from` and a GROUP BY — not a rewrite.
 *
 * Weekdays are numbered the way JavaScript numbers them, 0 = Sunday, because
 * the two calendar grids already ask `date.getDay()` and a second convention
 * would be converted in five places and forgotten in a sixth.
 */
exports.up = async function up(knex){
    await knex.schema.createTable('work_hours', t => {
        t.string('user_id', 24).notNullable()
        // 0 = Sunday … 6 = Saturday.
        t.tinyint('weekday').unsigned().notNullable()
        // Minutes since midnight. 1440 is allowed as an end, so that a shift
        // can run to midnight; nothing here crosses into the next day.
        t.smallint('start_min').unsigned().notNullable()
        t.smallint('end_min').unsigned().notNullable()
        // Unpaid break, subtracted from the available time. Not a second
        // interval: where the break sits is nobody's business here, only that
        // it is not working time.
        t.smallint('break_min').unsigned().notNullable().defaultTo(0)

        t.primary(['user_id', 'weekday'])
        t.foreign('user_id').references('id').inTable('user').onDelete('CASCADE')
    })
}

exports.down = async function down(knex){
    await knex.schema.dropTableIfExists('work_hours')
}
