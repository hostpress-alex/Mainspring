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
    const classes = [variant, `fa-${name}`, fixedWidth && 'fa-fw', className].filter(Boolean).join(' ')
    return <i className={classes} aria-hidden="true" {...rest} />
}
