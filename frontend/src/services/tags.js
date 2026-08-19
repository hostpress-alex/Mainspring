/**
 * Tags on a task, and the list a column offers.
 *
 * The list belongs to the COLUMN, not to the installation. Two boards that
 * both say "#Website" mean two different things and that is the point: a tag
 * list is a vocabulary somebody made up for one board, and a global one grows
 * until nobody reads it. (Priorities went the other way, deliberately — those
 * are a fixed scale everybody has to agree on. See priority.store.)
 *
 * Because of that, none of this needs a table. The tag definitions ride in
 * `board_column.settings` the way status labels do, and a task stores an
 * array of tag ids in its column value. Ids, not the words: renaming a tag is
 * then one entry in the column and touches no task at all.
 *
 * Everything here is a pure function over arrays. The saving lives in
 * board.actions (saveColumnTags), the screen in modal-tags.
 */

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** How long a tag may be. Long enough to be a name, short enough to be a chip. */
export const MAX_TAG_LENGTH = 40

/** How many tags one cell may hold before it stops being a summary. */
export const MAX_TAGS_PER_TASK = 20

/**
 * The colours a new tag can get.
 *
 * Picked by the tag's own name rather than in turn, so the same word always
 * comes out the same colour — including on another board. A colour that moves
 * when the list is re-sorted is a colour nobody learns.
 */
export const TAG_PALETTE = [
    '#0073ea', '#00c875', '#e2445c', '#fdab3d', '#a25ddc', '#00a9a5',
    '#579bfc', '#ff642e', '#9d99b9', '#037f4c', '#bb3354', '#7f5347'
]

export function makeTagId(){
    let id = 'tg_'
    for(let i = 0; i < 8; i++) id += CHARS[Math.floor(Math.random() * CHARS.length)]
    return id
}

/**
 * The written form of a tag.
 *
 * The leading # is decoration and is not stored: people type it out of habit,
 * and keeping it would make "#Website" and "Website" two different tags.
 */
export function cleanTagTitle(value){
    return String(value === undefined || value === null?'':value)
        .replace(/^#+/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_TAG_LENGTH)
}

/** What counts as "the same tag" — case and the # do not. */
export const tagKey = title => cleanTagTitle(title).toLowerCase()

/** A stable colour for a name. */
export function colorFor(title){
    const key = tagKey(title)
    let hash = 0
    for(let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
    return TAG_PALETTE[hash % TAG_PALETTE.length]
}

export function tagsOf(column){
    return (column && Array.isArray(column.tags))?column.tags.filter(t => t && t.id):[]
}

export function findTagByTitle(tags, title){
    const key = tagKey(title)
    return tags.find(t => tagKey(t.title) === key) || null
}

export function findTagById(tags, id){
    return tags.find(t => t.id === id) || null
}

/**
 * Add a tag, or hand back the one that already means this.
 *
 * The second half is the whole defence against a list of near-duplicates: a
 * person typing "website" when "Website" exists gets the existing one, not a
 * second entry that will diverge from it for ever.
 */
export function addTag(tags, title){
    const clean = cleanTagTitle(title)
    if(!clean) return {tags, tag: null}
    const existing = findTagByTitle(tags, clean)
    if(existing) return {tags, tag: existing}
    const tag = {id: makeTagId(), title: clean, color: colorFor(clean)}
    return {tags: [...tags, tag], tag}
}

/** Returns null when the new name is taken by a different tag. */
export function renameTag(tags, id, title){
    const clean = cleanTagTitle(title)
    if(!clean) return null
    const clash = findTagByTitle(tags, clean)
    if(clash && clash.id !== id) return null
    return tags.map(t => (t.id === id?{...t, title: clean}:t))
}

export function recolorTag(tags, id, color){
    return tags.map(t => (t.id === id?{...t, color}:t))
}

export function removeTag(tags, id){
    return tags.filter(t => t.id !== id)
}

/* ----------------------------------------------------------- the value -- */

/** The tags of one task, always as a list of ids. */
export function valueOf(task, field){
    const raw = task?task[field]:null
    if(Array.isArray(raw)) return raw.filter(v => typeof v === 'string' && v)
    // A single string is what an older cell of another type might hold. Read
    // it rather than throwing the task's data away on the first render.
    if(typeof raw === 'string' && raw) return [raw]
    return []
}

export function withTag(value, id){
    if(value.includes(id)) return value
    return [...value, id].slice(0, MAX_TAGS_PER_TASK)
}

export function withoutTag(value, id){
    return value.filter(v => v !== id)
}

/**
 * How often each tag is used on this board.
 *
 * Counted over the board that is on screen rather than asked of the server:
 * the list is per column, so everything needed is already here, and a number
 * next to a tag is only ever read while the list is open.
 */
export function usageOf(board, field){
    const counts = {}
    const walk = task => {
        for(const id of valueOf(task, field)) counts[id] = (counts[id] || 0) + 1
        for(const child of task.subtasks || []) walk(child)
    }
    for(const group of (board && board.groups) || []){
        for(const task of group.tasks || []) walk(task)
    }
    return counts
}
