/**
 * Which icons would be missing without Font Awesome Pro?
 *
 * Development happens with Pro installed, so a Pro-only icon looks correct
 * here for ever and nobody without the licence will ever report it. The check
 * runs at every dev-server start and turns that into a list you can see.
 *
 * The source of truth is the metadata of the FREE package — no maintained
 * list of our own that would go stale.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'

const METADATA = 'node_modules/@fortawesome/fontawesome-free/metadata/icon-families.json'

/** `<Icon name='star' style='fa-regular' />` — the usual way. */
const USE = /<Icon\s+name='([a-z0-9-]+)'(?:\s+style='fa-([a-z-]+)')?/g

/**
 * Icons chosen at runtime cannot be read out of the JSX. They are declared in
 * a table as `faIcon: 'file-pdf'` (see cmps/task/file-type.js) — write it that
 * way and the check sees them too. The key is deliberately not `icon:`, which
 * already means something else elsewhere (column.service.js).
 */
const TABLE = /\bfaIcon:\s*'([a-z0-9-]+)'/g

function sourceFiles (dir, found = []) {
    for (const entry of readdirSync(dir)) {
        if (entry === '_to_delete' || entry === 'node_modules') continue
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) sourceFiles(path, found)
        else if (['.jsx', '.js'].includes(extname(entry))) found.push(path)
    }
    return found
}

export function checkIcons (root = 'src') {
    if (!existsSync(METADATA)) return { skipped: 'Font Awesome Free is not installed — run npm install' }

    const families = JSON.parse(readFileSync(METADATA, 'utf8'))
    const free = new Map()
    for (const [name, data] of Object.entries(families)) {
        const styles = (data.familyStylesByLicense?.free || [])
            .filter(entry => entry.family === 'classic')
            .map(entry => entry.style)
        if (styles.length) free.set(name, new Set(styles))
    }

    const used = new Map()          // "style/name" -> [files]
    for (const file of sourceFiles(root)) {
        const text = readFileSync(file, 'utf8')
        for (const [pattern, styleFrom] of [[USE, m => m[2] || 'solid'], [TABLE, () => 'solid']]) {
            for (const match of text.matchAll(pattern)) {
                const key = `${styleFrom(match)}/${match[1]}`
                if (!used.has(key)) used.set(key, [])
                used.get(key).push(file)
            }
        }
    }

    const proOnly = []
    for (const [key, files] of used) {
        const [style, name] = key.split('/')
        if (style === 'brands') continue
        if (!free.has(name)) proOnly.push({ key, why: 'not in the free set', files })
        else if (!free.get(name).has(style)) proOnly.push({ key, why: `free only has ${[...free.get(name)].join(', ')}`, files })
    }
    return { total: used.size, proOnly }
}

/**
 * Prints one line at dev-server start; the detail only when something is wrong.
 *
 * Plain ASCII on purpose: an em dash in a line that Vite reprints after its
 * own banner came out of the terminal cut in half.
 */
export function reportIcons (label) {
    const result = checkIcons()
    if (result.skipped) {
        console.log(`[icons] ${label}: ${result.skipped}`)
        return
    }
    if (!result.proOnly.length) {
        console.log(`[icons] ${label}: all ${result.total} icons also exist in the free set`)
        return
    }
    console.log(`[icons] ${label}: ${result.proOnly.length} of ${result.total} icons need Pro and stay empty for everyone else`)
    for (const { key, why, files } of result.proOnly) {
        console.log(`        fa-${key.replace('/', ' fa-')}  (${why})  ${files[0]}${files.length > 1 ? ` +${files.length - 1}` : ''}`)
    }
}
