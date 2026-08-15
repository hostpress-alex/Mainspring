/**
 * The two storage implementations have to keep the same outside.
 *
 * Every repository exists twice — once for MongoDB, once for MariaDB — and
 * DB_DRIVER decides which one is loaded. Adding a function to one and
 * forgetting the other does not fail at start-up. It fails much later, when
 * somebody switches the driver back and one particular button stops working.
 *
 * That is a rule written down in DATENBANK.md, and a rule nobody can check by
 * eye is a rule that quietly rots. This test checks it.
 *
 * It compares exported names only. Whether both implementations *behave* the
 * same is a different question and needs a live database of each kind.
 */
const test = require('node:test')
const assert = require('node:assert')

const PAIRS = [
    ['board', '../api/board/board.repo.mongo', '../api/board/board.repo.sql'],
    ['user', '../api/user/user.repo.mongo', '../api/user/user.repo.sql'],
    ['schedule', '../api/schedule/schedule.repo.mongo', '../api/schedule/schedule.repo.sql'],
    ['file', '../services/file.repo.mongo', '../services/file.repo.sql'],
]

for (const [name, mongoPath, sqlPath] of PAIRS) {
    test(`${name}: mongo and sql repository export the same names`, () => {
        const mongo = require(mongoPath)
        const sql = require(sqlPath)

        const mongoKeys = Object.keys(mongo).sort()
        const sqlKeys = Object.keys(sql).sort()

        const onlyMongo = mongoKeys.filter(key => !sqlKeys.includes(key))
        const onlySql = sqlKeys.filter(key => !mongoKeys.includes(key))

        assert.deepStrictEqual(
            { onlyMongo, onlySql },
            { onlyMongo: [], onlySql: [] },
            `${name}.repo.mongo.js and ${name}.repo.sql.js have drifted apart. ` +
            `Only in mongo: [${onlyMongo}]. Only in sql: [${onlySql}].`)
    })

    test(`${name}: matching names are the same kind of thing`, () => {
        const mongo = require(mongoPath)
        const sql = require(sqlPath)

        for (const key of Object.keys(mongo)) {
            if (!(key in sql)) continue
            assert.strictEqual(typeof sql[key], typeof mongo[key],
                `${name}: "${key}" is a ${typeof mongo[key]} in mongo but a ${typeof sql[key]} in sql`)
        }
    })
}
