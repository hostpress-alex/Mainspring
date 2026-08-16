/**
 * Mentions in comment text.
 *
 * Stored form:  `Danke @[Alex Neumann](u_9f3c) — schaust du drauf?`
 * Shown form:   `Danke @Alex Neumann — schaust du drauf?`, the name coloured.
 *
 * The id is carried along rather than just the name, so a mention keeps
 * pointing at the same person after a rename, and so two people with the same
 * name are still two people once they are stored.
 *
 * Comments written before this existed contain no tokens and render exactly as
 * they always did — which is why the mention lives inside the text and not in
 * a column beside it. No migration, no second write path.
 *
 * What is deliberately NOT done: tracking, while typing, which suggestion was
 * picked for which position. The text is a plain textarea and people edit in
 * the middle of it, so any list of positions is wrong a keystroke later.
 * Instead the names are matched against the board's members at submit time —
 * see toStorage. The one thing that costs is two members with an identical
 * name: the first one wins. In a team of fifteen that is a trade worth making
 * for a mechanism that cannot drift out of sync.
 */

/** `@[Name](id)` — the stored form. */
const TOKEN = /@\[([^\]\n]+)\]\(([^)\s]+)\)/g

/** What may follow an `@` while the suggestion list is open. */
const QUERY_CHARS = /^[\p{L}\p{N}._-]*$/u

/**
 * Is the caret sitting in an `@…` that we should be suggesting for?
 *
 * The `@` only counts at the start of the text or after whitespace, so an
 * e-mail address does not open the list on every keystroke.
 */
export function activeQuery(text, caret){
    const before = String(text || '').slice(0, caret)
    const at = before.lastIndexOf('@')
    if(at < 0) return null
    if(at > 0 && !/\s/.test(before[at - 1])) return null

    const query = before.slice(at + 1)
    if(!QUERY_CHARS.test(query)) return null
    return {start: at, query}
}

/**
 * Members whose name matches the query.
 *
 * Matched per word, not only on the whole name: typing `n` should offer
 * "Alex Neumann". An empty query offers everybody, so a bare `@` shows the
 * list rather than nothing.
 */
export function matchMembers(members, query){
    const list = (Array.isArray(members)?members:[]).filter(m => m && m._id && m.fullname)
    const q = String(query || '').trim().toLowerCase()
    if(!q) return list
    return list.filter(m => String(m.fullname).toLowerCase().split(/\s+/).some(word => word.startsWith(q)))
}

/**
 * Put the chosen name into the text, replacing the `@…` that was being typed.
 * Returns the new text and where the caret belongs afterwards.
 */
export function insertMention(text, start, caret, member){
    const s = String(text || '')
    const inserted = `@${member.fullname} `
    return {
        text: s.slice(0, start) + inserted + s.slice(caret),
        caret: start + inserted.length
    }
}

/**
 * Shown form -> stored form, right before the comment is saved.
 *
 * Longest names first: with "Alex" and "Alex Neumann" both on the board,
 * matching "Alex" first would leave " Neumann" dangling outside the mention.
 */
export function toStorage(text, members){
    let out = String(text || '')
    const known = (Array.isArray(members)?members:[])
        .filter(m => m && m._id && m.fullname)
        .sort((a, b) => String(b.fullname).length - String(a.fullname).length)

    for(const member of known){
        const name = String(member.fullname)
        // Escaped, because a name may contain a dot or a hyphen.
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        out = out.replace(new RegExp(`@${escaped}(?![\\p{L}\\p{N}])`, 'gu'), `@[${name}](${member._id})`)
    }
    return out
}

/**
 * Stored form -> pieces for rendering.
 *
 * Returns a flat list of `{type: 'text', value}` and
 * `{type: 'mention', id, name}`. Building React nodes from this rather than
 * handing a string to dangerouslySetInnerHTML is the whole reason it exists:
 * comment text is written by users.
 */
export function parse(text){
    const s = String(text || '')
    const parts = []
    let last = 0

    TOKEN.lastIndex = 0
    let match
    while((match = TOKEN.exec(s)) !== null){
        if(match.index > last) parts.push({type: 'text', value: s.slice(last, match.index)})
        parts.push({type: 'mention', name: match[1], id: match[2]})
        last = match.index + match[0].length
    }
    if(last < s.length) parts.push({type: 'text', value: s.slice(last)})
    return parts
}

/** The ids mentioned in a stored text, each once. */
export function mentionedIds(text){
    return [...new Set(parse(text).filter(p => p.type === 'mention').map(p => p.id))]
}

/** Stored form -> plain readable text, for previews and notifications. */
export function toPlain(text){
    return parse(text).map(p => (p.type === 'mention'?`@${p.name}`:p.value)).join('')
}
