/**
 * Bildmarke: Zifferblatt mit zwei Zeigern — der lange Zeiger bricht durch den
 * Ring und wird zum Haken. Zeit und Erledigt in einer Form.
 *
 * Warum drei Varianten und nicht einfach Deckkraft:
 * Der Ring lebt vom Kontrast zum Untergrund. Orange mit 38 % Deckkraft
 * verschwindet auf der dunklen Seitenleiste (#292f4c) fast vollstaendig.
 * Deshalb bringt jede Variante ihre eigene Ringfarbe mit.
 *
 *   tone="brand"  helle Flaechen — Haken in der Hausfarbe, Ring blass daneben
 *   tone="light"  dunkle Flaechen (Seitenleiste, App-Kachel) — alles in Weiss
 *   tone="mono"   erbt die Textfarbe, z. B. fuer Druck oder Graustufen
 */
export const BRAND_COLOR = '#EB5522'

const TONES = {
    brand: { hand: BRAND_COLOR, ring: BRAND_COLOR, ringOpacity: 0.38 },
    light: { hand: '#ffffff', ring: '#ffffff', ringOpacity: 0.55 },
    mono: { hand: 'currentColor', ring: 'currentColor', ringOpacity: 0.4 },
}

export function LogoMark({ size = 32, tone = 'brand', title = 'Logo', ...rest }) {
    const t = TONES[tone] || TONES.brand
    return (
        <svg width={size} height={size} viewBox="0 0 48 48"
            xmlns="http://www.w3.org/2000/svg" role="img" aria-label={title} {...rest}>
            <circle cx="24" cy="26" r="16" fill="none"
                stroke={t.ring} strokeOpacity={t.ringOpacity} strokeWidth="3.4" />
            <path d="M17.5 26.5l5.5 5.5" fill="none"
                stroke={t.hand} strokeWidth="4.4" strokeLinecap="round" />
            <path d="M23 32L39 8" fill="none"
                stroke={t.hand} strokeWidth="4.4" strokeLinecap="round" />
        </svg>
    )
}

export default LogoMark
