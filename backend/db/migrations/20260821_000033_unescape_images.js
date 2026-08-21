/**
 * Give back the images that were turned into their own source text.
 *
 * `fromLegacy` in the frontend decides whether a stored value is HTML or old
 * plain text, and it decided with a hand-written list of tag names that had
 * drifted from the allowlist next to it: `img` was allowed and not
 * recognised. A pasted screenshot is an update whose entire content is one
 * `<img>`, so it failed that test every time, was taken for plain text and
 * escaped. The reader then saw
 *
 *     &lt;img src="/api/upload/833ec2…" alt="image.png"&gt;
 *
 * printed as words. Worse, the editor was re-seeded from the escaped value, so
 * typing one more character stored it that way for good. The list is derived
 * from the allowlist now, which fixes every row that is still intact — and
 * does nothing for the rows that were already written escaped. Those are what
 * this is for.
 *
 * **Only an exact upload address is unescaped**, `/api/upload/` followed by
 * the 32 hex characters the upload endpoint issues. Not "any escaped img":
 * text somebody typed by hand about an `<img>` tag, or an escaped image
 * pointing anywhere else, is left exactly as it is. Turning text back into
 * markup is the one direction where being generous re-opens the hole the
 * sanitizer exists to close, so the rule is narrow enough to be read in one
 * line and everything outside it stays untouched.
 *
 * Three columns hold text written in that editor: an update, a board
 * description and the note on a calendar entry.
 *
 * No `down`. Re-escaping would not restore an answer — it would restore a
 * defect, and one nobody could tell from a row that was never broken.
 */

/**
 * `&lt;img …&gt;` for an upload of ours, in one piece, and nothing else.
 *
 * Deliberately one strict pattern rather than a loose match plus clean-up
 * afterwards. Turning stored text back into markup is the one direction where
 * being generous re-opens the hole the sanitizer exists to close, so anything
 * that does not fit exactly this shape is left as the text it currently is:
 *
 *   - the address must be `/api/upload/` and the 32 hex characters the upload
 *     endpoint issues — nothing else, however plausible it looks;
 *   - the alt, if there is one, may not contain `&`, `"`, `<` or `>`. An alt
 *     carrying escaped entities is not parsed and not guessed at; that row
 *     keeps its text and somebody can look at it.
 *
 * The first attempt read the attributes as `[^&]*` and got this wrong in both
 * directions: it stopped at the first `&quot;`, so the common case (everything
 * escaped) never matched at all, and where it did match it could leave half a
 * tag behind. Narrow beats clever here.
 */
const ESCAPED_IMG = new RegExp(
    '&lt;img\\s+src=(?:&quot;|")\\/api\\/upload\\/([a-f0-9]{32})(?:&quot;|")'
    + '(?:\\s+alt=(?:&quot;|")([^&"<>]*)(?:&quot;|"))?'
    + '\\s*\\/?&gt;',
    'gi')

/** Rebuild the tag from the two parts that may be trusted: our id, and an alt
 *  that has already been proved to hold nothing dangerous. */
function unescapeImages(text){
    return String(text).replace(ESCAPED_IMG, (whole, id, alt) =>
        alt?`<img src="/api/upload/${id}" alt="${alt}">`:`<img src="/api/upload/${id}">`)
}

const TARGETS = [
    {table: 'task_comment', column: 'txt', keys: ['board_id', 'task_id', 'id']},
    {table: 'board', column: 'description', keys: ['id']},
    {table: 'schedule', column: 'note', keys: ['id']}
]

exports.up = async function up(knex){
    let repaired = 0

    for(const {table, column, keys} of TARGETS){
        // Plain `like`, not knex's `whereLike`: that one appends
        // `COLLATE utf8_bin`, which a utf8mb4 column refuses — and a
        // migration that throws is a server that will not start.
        const rows = await knex(table)
            .where(column, 'like', '%&lt;img%')
            .select([...keys, column])

        for(const row of rows){
            const before = row[column] || ''
            const after = unescapeImages(before)
            if(after === before) continue

            const where = {}
            for(const key of keys) where[key] = row[key]
            await knex(table).where(where).update({[column]: after})
            repaired++
        }
    }

    if(repaired) console.log(`image repair: ${repaired} row(s) had an escaped image put back`)
}

exports.down = async function down(){
}

// Exported so the rule can be exercised without a database.
exports.unescapeImages = unescapeImages
