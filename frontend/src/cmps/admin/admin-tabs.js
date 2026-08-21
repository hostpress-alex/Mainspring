/**
 * The sections of the administration, as data.
 *
 * A list and not a switch, because "further tabs may follow" was the
 * requirement — and a fifth tab should be one entry here, not a new branch in
 * three places. The order is the order on screen.
 *
 * `key` travels in the address, so it is a stable word and not an index: a
 * bookmark on ?tab=users has to survive somebody putting a new tab in front
 * of it.
 */
export const ADMIN_TABS = [
    {key: 'general', labelKey: 'admin.tabGeneral', icon: 'sliders'},
    {key: 'team', labelKey: 'admin.tabTeam', icon: 'users'},
    {key: 'users', labelKey: 'admin.tabUsers', icon: 'user-gear'},
    {key: 'boards', labelKey: 'admin.tabBoards', icon: 'chalkboard'},
    {key: 'tokens', labelKey: 'admin.tabTokens', icon: 'key'}
]

export const DEFAULT_ADMIN_TAB = ADMIN_TABS[0].key

/**
 * Which tab the address asks for.
 *
 * Anything unknown falls back to the first rather than showing an empty page.
 * That covers the three ways this goes wrong in practice: no parameter at all,
 * a typo, and a bookmark from before a tab was renamed — and an empty
 * administration reads as a broken one.
 */
export function resolveAdminTab(value){
    const wanted = String(value || '').trim().toLowerCase()
    return ADMIN_TABS.some(tab => tab.key === wanted)?wanted:DEFAULT_ADMIN_TAB
}
