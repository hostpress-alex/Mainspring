/**
 * Logo mark: a clock face with two hands — the long hand breaks through the
 * ring and turns into a tick. Time and done in one shape.
 *
 * Why three variants and not simply opacity:
 * The ring lives off the contrast with its background. Orange at 38 % opacity
 * all but disappears on the dark sidebar (#292f4c). So every variant brings
 * its own ring colour.
 *
 *   tone="brand"  light surfaces — tick in the house colour, pale ring beside it
 *   tone="light"  dark surfaces (sidebar, app tile) — everything in white
 *   tone="mono"   inherits the text colour, for print or greyscale say
 */
export const BRAND_COLOR = '#EB5522'

const TONES = {
    brand: {hand: BRAND_COLOR, ring: BRAND_COLOR, ringOpacity: 0.38},
    light: {hand: '#ffffff', ring: '#ffffff', ringOpacity: 0.55},
    mono: {hand: 'currentColor', ring: 'currentColor', ringOpacity: 0.4}
}

export function LogoMark({size = 32, tone = 'brand', title = 'Logo', ...rest}){
    const t = TONES[tone] || TONES.brand
    return (
        <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={title} {...rest}>
            <circle cx="24" cy="26" r="16" fill="none" stroke={t.ring} strokeOpacity={t.ringOpacity} strokeWidth="3.4"/>
            <path d="M17.5 26.5l5.5 5.5" fill="none" stroke={t.hand} strokeWidth="4.4" strokeLinecap="round"/>
            <path d="M23 32L39 8" fill="none" stroke={t.hand} strokeWidth="4.4" strokeLinecap="round"/>
        </svg>
    )
}

export default LogoMark
