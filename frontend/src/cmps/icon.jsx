/**
 * The one icon in the app.
 *
 * Before this the icons came from nineteen different react-icons families
 * (Fa, Fi, Md, Bs, Io5, Hi, …), each with its own line weight and optical
 * size — which is why the toolbar never looked like one set. Everything now
 * goes through Font Awesome, and every icon through here.
 *
 *   <Icon name='trash-can' />
 *   <Icon name='filter' fixedWidth />
 *   <Icon name='github' variant='fa-brands' />
 *   <Icon name='circle' style={{'--label-color': color}} />
 *
 * The family is `variant`, not `style`. It used to be `style`, which shadowed
 * the DOM attribute of that name: an inline `style={{...}}` never reached the
 * element and was pasted into the class list as "[object Object]" instead.
 * Silent, and it cost the group colour palette all of its colours and its
 * glyphs. `style` now goes through to the DOM like on any other element.
 *
 * Rule: only icons that also exist in the FREE set. Font Awesome Pro is a
 * licence for other *styles* (light, thin, duotone, sharp), not for icons
 * that a clone without the Pro files would be missing. See vendor/README.md.
 *
 * Own logos and hand-drawn icons stay SVG components — this is only for the
 * standard set.
 */

/**
 * The weight of the whole app. `fa-solid` is the only one the free set carries
 * in full; with Pro installed this can become 'fa-regular' or 'fa-light' and
 * every icon follows.
 */
export const ICON_STYLE = 'fa-solid'

export function Icon({name, variant = ICON_STYLE, fixedWidth = false, className = '', ...rest}){
    // `name` is written WITHOUT the fa- prefix; this adds it. Writing it out
    // produced `fa-fa-…`, which matches no rule and renders an empty box that
    // looks exactly like an icon that has not loaded yet — so it is caught
    // here, where it is cheap, instead of by eye on a page nobody opened.
    const clean = String(name || '').replace(/^fa-/, '')
    if(import.meta.env?.DEV && clean !== name) console.warn('[icon] name should not start with fa-:', name)

    const classes = [variant, `fa-${clean}`, fixedWidth && 'fa-fw', className].filter(Boolean).join(' ')
    return <i className={classes} aria-hidden="true" {...rest} />
}
