/**
 * Text catalogue.
 *
 * Every user-visible string lives in i18n/<language>.json, not in the JSX.
 * Two reasons, the second one being the more important:
 *
 *   1. A second language is then nothing but one more JSON file.
 *   2. Wording can be changed in one place and stays consistent — before this
 *      the app said "Löschen" in one dialog and "Entfernen" in the next.
 *
 * English is the source language: keys are English, en.json holds the
 * originals, every other file is a translation of it and falls back to
 * English for anything it is missing. The interface starts in German
 * because that is what the team reads.
 *
 * Deliberately without a library: react-i18next can do far more (namespaces,
 * lazy loading, contexts) and a tool for fifteen people needs none of it.
 * What is needed — placeholders and plurals — is right here.
 *
 *   t('common.delete')                       -> "Löschen"
 *   t('task.deleteName', { title: 'X' })     -> 'Der Task „X“'
 *   t('task.count', { n: 3 })                -> "3 Tasks"
 */
import en from './en.json'
import de from './de.json'

const LANGUAGES = {en, de}

/** Missing keys fall back to this one. */
const FALLBACK_LANGUAGE = 'en'

/** What a first-time visitor sees. */
const DEFAULT_LANGUAGE = 'de'

const STORAGE_KEY = 'language'

let current = detectLanguage()

function detectLanguage(){
    try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if(stored && LANGUAGES[stored]) return stored
    } catch(err) { /* no localStorage */
    }
    const fromBrowser = (typeof navigator !== 'undefined'?navigator.language || '':'').slice(0, 2)
    return LANGUAGES[fromBrowser]?fromBrowser:DEFAULT_LANGUAGE
}

export function getLanguage(){
    return current
}

export function availableLanguages(){
    return Object.keys(LANGUAGES)
}

/**
 * Switch language.
 *
 * Reloads the page instead of threading a provider through the whole tree.
 * Switching happens once a year — that does not justify a rebuild in which
 * every component hangs off a context.
 */
export function setLanguage(code){
    if(!LANGUAGES[code] || code === current) return
    try {
        localStorage.setItem(STORAGE_KEY, code)
    } catch(err) { /* never mind */
    }
    window.location.reload()
}

/** Look up a value for a key like "task.delete". */
function lookUp(dictionary, key){
    let value = dictionary
    for(const part of String(key).split('.')){
        if(value === null || typeof value !== 'object') return undefined
        value = value[part]
    }
    return value
}

/** Replace {name} with the given values. A missing value keeps its placeholder. */
function interpolate(template, values){
    if(!values) return template
    return String(template).replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(values, name)?String(values[name]):match)
}

export function t(key, values){
    let value = lookUp(LANGUAGES[current], key)
    if(value === undefined && current !== FALLBACK_LANGUAGE){
        value = lookUp(LANGUAGES[FALLBACK_LANGUAGE], key)
    }

    if(value === undefined){
        // Do not silently show the key — a gap should not have to be spotted
        // in the running interface first.
        if(import.meta.env?.DEV) console.warn('[i18n] no text for:', key)
        return key
    }

    // Singular and plural: { "one": "1 task", "other": "{n} tasks" }
    if(value !== null && typeof value === 'object'){
        const n = Number(values && values.n)
        const form = n === 1?'one':'other'
        value = value[form] !== undefined?value[form]:value.other
        if(value === undefined) return key
    }

    return interpolate(value, values)
}

export default t
