import {describe, it, expect} from 'vitest'
import {ADMIN_TABS, DEFAULT_ADMIN_TAB, resolveAdminTab} from '../cmps/admin/admin-tabs'
import {t} from '../i18n'

describe('resolveAdminTab — which section the address asks for', () => {
    it('takes a tab it knows', () => {
        for(const tab of ADMIN_TABS) expect(resolveAdminTab(tab.key)).toBe(tab.key)
    })

    it('falls back to the first when nothing is asked for', () => {
        // An empty administration reads as a broken one, so there is no such
        // thing as "no tab".
        expect(resolveAdminTab(undefined)).toBe(DEFAULT_ADMIN_TAB)
        expect(resolveAdminTab(null)).toBe(DEFAULT_ADMIN_TAB)
        expect(resolveAdminTab('')).toBe(DEFAULT_ADMIN_TAB)
        expect(resolveAdminTab('   ')).toBe(DEFAULT_ADMIN_TAB)
    })

    it('falls back on a bookmark that no longer means anything', () => {
        // A link from before a tab was renamed, or a typo.
        expect(resolveAdminTab('benutzer')).toBe(DEFAULT_ADMIN_TAB)
        expect(resolveAdminTab('user')).toBe(DEFAULT_ADMIN_TAB)
        expect(resolveAdminTab('../../etc')).toBe(DEFAULT_ADMIN_TAB)
    })

    it('is not case-sensitive', () => {
        expect(resolveAdminTab('USERS')).toBe('users')
        expect(resolveAdminTab(' Boards ')).toBe('boards')
    })

    it('survives something that is not text at all', () => {
        expect(resolveAdminTab(42)).toBe(DEFAULT_ADMIN_TAB)
        expect(resolveAdminTab({})).toBe(DEFAULT_ADMIN_TAB)
        expect(resolveAdminTab([])).toBe(DEFAULT_ADMIN_TAB)
    })
})

describe('ADMIN_TABS — the list a fifth tab is added to', () => {
    it('has a unique, url-safe key per tab', () => {
        const keys = ADMIN_TABS.map(tab => tab.key)
        expect(new Set(keys).size).toBe(keys.length)
        for(const key of keys) expect(key).toMatch(/^[a-z][a-z0-9-]*$/)
    })

    it('names every tab through the catalogue, not in the JSX', () => {
        for(const tab of ADMIN_TABS){
            expect(tab.labelKey).toMatch(/^admin\./)
            // A missing key would render as the key itself, which is how
            // half-translated interfaces look.
            expect(t(tab.labelKey)).not.toBe(tab.labelKey)
        }
    })

    it('gives every tab an icon', () => {
        for(const tab of ADMIN_TABS) expect(tab.icon).toBeTruthy()
    })

    it('starts on the first entry', () => {
        expect(DEFAULT_ADMIN_TAB).toBe(ADMIN_TABS[0].key)
    })
})
