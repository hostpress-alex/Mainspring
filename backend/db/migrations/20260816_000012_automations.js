/**
 * Automations: "when this happens, do that", per board.
 *
 * Two tables, and the second one is not optional decoration. A rule that does
 * not fire looks exactly like a rule that fired and did nothing, and without a
 * record of the attempt the only way to tell them apart is to read the server
 * log — which the person who wrote the rule cannot do.
 *
 * `trigger_type` is a column of its own although the same word is inside
 * `trigger_config`. That is on purpose: the engine runs on every task write and
 * only wants the rules that could possibly match. Reading and parsing every
 * rule of a board to throw most of them away is work done on the hot path.
 *
 * The column is NOT called `trigger`. That is a reserved word in MySQL and
 * MariaDB; knex quotes it and it would work, but every hand-written query and
 * every look in DBeaver would need the backticks too.
 *
 * `automation_run.automation_id` has no foreign key and stays behind when the
 * rule is deleted. The log answers "what did the board do to my task", and the
 * most interesting case is a rule somebody has since removed.
 */
exports.up = async function up(knex){
    await knex.schema.createTable('automation', t => {
        t.string('id', 24).notNullable().primary()
        t.string('board_id', 24).notNullable()
        t.boolean('enabled').notNullable().defaultTo(true)
        t.string('trigger_type', 40).notNullable()
        t.json('trigger_config').notNullable()
        t.json('actions').notNullable()
        // Whose rights the rule runs with. Not decoration: the person who
        // triggers a rule may be a viewer, and the rule still has to be
        // allowed to move the task.
        t.string('created_by', 24).nullable()
        t.bigInteger('created_at').nullable()
        t.bigInteger('updated_at').nullable()
        t.index(['board_id', 'enabled'], 'idx_automation_board')
        t.foreign('board_id').references('id').inTable('board').onDelete('CASCADE')
    })

    await knex.schema.createTable('automation_run', t => {
        t.bigIncrements('seq').primary()
        t.string('board_id', 24).notNullable()
        t.string('automation_id', 24).nullable()
        t.string('task_id', 40).nullable()
        t.string('task_title', 190).notNullable().defaultTo('')
        // done | skipped | failed. A string rather than an enum: a new outcome
        // should not need a migration.
        t.string('outcome', 20).notNullable()
        t.string('summary', 500).notNullable().defaultTo('')
        t.bigInteger('created_at').nullable()
        t.index(['board_id', 'seq'], 'idx_run_board')
    })
}

exports.down = async function down(knex){
    await knex.schema.dropTableIfExists('automation_run')
    await knex.schema.dropTableIfExists('automation')
}
