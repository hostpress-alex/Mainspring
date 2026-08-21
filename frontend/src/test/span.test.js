import {describe, it, expect} from 'vitest'
import {fmtSpan} from '../services/date.util'
import {LIFETIME_YEARS} from '../cmps/admin/token-admin'

const HOUR = 3600000
const DAY = 24 * HOUR
const YEAR = 365 * DAY

describe('fmtSpan — one unit, the largest that fits', () => {
    it('answers in years for a token lifetime', () => {
        expect(fmtSpan(YEAR)).toMatch(/1 Jahr$/)
        expect(fmtSpan(5 * YEAR)).toMatch(/^5 Jahre/)
        // The point of this function: fmtDuration would say "43800 h".
        expect(fmtSpan(5 * YEAR)).not.toMatch(/Std|h/)
    })

    it('rounds the number but picks the unit by the whole part', () => {
        // The bug this caught: 729 days is 1.997 years. Flooring showed
        // "1 Jahr" next to an expiry date two years out, and a reader decides
        // one of the two is wrong. Rounding everything would call 20 days
        // "1 Monat" instead of "20 Tage".
        expect(fmtSpan(729 * DAY)).toMatch(/^2 Jahre/)
        expect(fmtSpan(20 * DAY)).toMatch(/^20 Tage/)
        expect(fmtSpan(400 * DAY)).toMatch(/1 Jahr$/)
    })

    it('never says nought of anything', () => {
        // A span just over its unit must not round down to zero.
        for(const ms of [YEAR + 1, YEAR / 12 + 1, DAY + 1, HOUR + 1]){
            expect(fmtSpan(ms)).not.toMatch(/^0/)
        }
    })

    it('drops to months, days and hours as the span shrinks', () => {
        expect(fmtSpan(YEAR / 12 * 3)).toMatch(/3 Monate/)
        expect(fmtSpan(12 * DAY)).toMatch(/12 Tage/)
        expect(fmtSpan(4 * HOUR)).toMatch(/4 Stunden/)
    })

    it('uses the singular where there is one of something', () => {
        expect(fmtSpan(YEAR)).not.toMatch(/Jahre/)
        expect(fmtSpan(DAY)).not.toMatch(/Tage/)
        expect(fmtSpan(HOUR)).not.toMatch(/Stunden/)
    })

    it('says something for a span shorter than an hour', () => {
        // A token revoked two minutes after it was minted. "0 Stunden" would
        // read as a bug.
        expect(fmtSpan(0)).toBeTruthy()
        expect(fmtSpan(60000)).toBeTruthy()
        expect(fmtSpan(0)).not.toMatch(/^0/)
    })

    it('does not go negative on a clock that disagrees', () => {
        expect(fmtSpan(-5 * DAY)).toBe(fmtSpan(0))
    })

    it('survives being handed nothing', () => {
        expect(fmtSpan(null)).toBeTruthy()
        expect(fmtSpan(undefined)).toBeTruthy()
        expect(fmtSpan('quatsch')).toBeTruthy()
    })
})

describe('LIFETIME_YEARS — the menu may not lie', () => {
    it('is a plain list of years', () => {
        // The defect this replaced: two entries labelled 3 and 5 years both
        // carried `ms: 2 * YEAR_MS`, so the menu offered five and handed out
        // two. Deriving the value from the number is what makes that
        // impossible, and this test is what keeps it derived.
        expect(LIFETIME_YEARS.length).toBeGreaterThan(0)
        for(const years of LIFETIME_YEARS){
            expect(Number.isInteger(years)).toBe(true)
            expect(years).toBeGreaterThan(0)
        }
        expect(new Set(LIFETIME_YEARS).size).toBe(LIFETIME_YEARS.length)
    })

    it('stays within what the server accepts', () => {
        // MAX_TTL_MS in api/token/token.controller. The server refuses more
        // rather than clamping, so exceeding this is a 400 and not a silent
        // difference — but it should not come to that.
        expect(Math.max(...LIFETIME_YEARS)).toBeLessThanOrEqual(5)
    })
})
