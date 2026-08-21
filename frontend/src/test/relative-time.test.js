import {describe, it, expect} from 'vitest'
import {utilService} from '../services/util.service'
import {msOrNull, fmtRelative} from '../services/date.util'
import {t} from '../i18n'

const MIN = 60 * 1000
const ago = minutes => Date.now() - minutes * MIN

describe('calculateTime — the largest unit that fits', () => {
    it('counts minutes, then hours, then days, then weeks', () => {
        expect(utilService.calculateTime(ago(5))).toBe(`5 ${t('time.minuteShort')}`)
        expect(utilService.calculateTime(ago(90))).toBe(`1 ${t('time.hourShort')}`)
        expect(utilService.calculateTime(ago(60 * 30))).toBe(`1 ${t('time.dayShort')}`)
        expect(utilService.calculateTime(ago(60 * 24 * 10))).toBe(`1 ${t('time.weekShort')}`)
    })

    it('says just now for the first two minutes', () => {
        expect(utilService.calculateTime(Date.now())).toBe(t('time.justNow'))
        expect(utilService.calculateTime(ago(1))).toBe(t('time.justNow'))
    })
})

describe('calculateTimeWithBefore — the one that said "vor 42492 Min."', () => {
    it('reports 41 hours as hours, not as minutes', () => {
        // The bug: every branch overwrote the one before it, so the smallest
        // unit always won and this read "vor 2492 Min." — with a stray debug
        // "4" in front of it, which is where 42492 came from.
        const text = utilService.calculateTimeWithBefore(ago(2492))
        expect(text).toBe(t('time.beforeTime', {time: `1 ${t('time.dayShort')}`}))
        expect(text).not.toMatch(/Min/)
    })

    it('carries no stray digits', () => {
        for(const minutes of [3, 90, 60 * 30, 60 * 24 * 10]){
            const text = utilService.calculateTimeWithBefore(ago(minutes))
            // A number glued to a number is the whole defect. Every digit
            // group in here has to be one the ladder actually produced.
            expect(text).not.toMatch(/\b[1-4]\d{3,}/)
        }
    })

    it('agrees with calculateTime, always', () => {
        // They used to be two copies of one ladder. Now there is one.
        for(const minutes of [2, 3, 59, 60, 61, 1439, 1440, 2492, 10079, 10080, 60 * 24 * 40]){
            expect(utilService.calculateTimeWithBefore(ago(minutes)))
                .toBe(t('time.beforeTime', {time: utilService.calculateTime(ago(minutes))}))
        }
    })

    it('does not say "vor gerade eben"', () => {
        expect(utilService.calculateTimeWithBefore(Date.now())).toBe(t('time.justNow'))
        expect(utilService.calculateTimeWithBefore(ago(1))).toBe(t('time.justNow'))
    })

    it('survives a moment in the future and a missing one', () => {
        // Clock skew between two machines is enough for the first one.
        expect(utilService.calculateTimeWithBefore(Date.now() + 5 * MIN)).toBe(t('time.justNow'))
        expect(utilService.calculateTimeWithBefore(null)).toBe('')
        expect(utilService.calculateTimeWithBefore(undefined)).toBe('')
        expect(utilService.calculateTimeWithBefore('')).toBe('')
        expect(utilService.calculateTime(undefined)).toBe('')
        expect(utilService.calculateTime(null)).toBe('')
    })
})

describe('msOrNull — Number(null) is 0, and 0 is finite', () => {
    it('refuses everything that is not a moment', () => {
        // The trap this exists for: `Number.isFinite(Number(null))` is true,
        // so the obvious guard calls a missing timestamp 1 January 1970 and
        // the interface says "vor 2955 Wo." where it should say nothing.
        expect(msOrNull(null)).toBe(null)
        expect(msOrNull(undefined)).toBe(null)
        expect(msOrNull('')).toBe(null)
        expect(msOrNull('irgendwas')).toBe(null)
        expect(msOrNull(NaN)).toBe(null)
        expect(msOrNull(new Date('kaputt'))).toBe(null)
    })

    it('lets a real moment through, however it arrived', () => {
        expect(msOrNull(0)).toBe(0)              // the epoch IS a moment
        expect(msOrNull(1787000000000)).toBe(1787000000000)
        expect(msOrNull(new Date(1787000000000))).toBe(1787000000000)
        expect(msOrNull('1787000000000')).toBe(1787000000000)
    })

    it('keeps fmtRelative quiet about missing values too', () => {
        // Same defect, same file, used by the notification bell.
        expect(fmtRelative(null)).toBe('')
        expect(fmtRelative(undefined)).toBe('')
        expect(fmtRelative('')).toBe('')
        expect(fmtRelative(Date.now())).not.toBe('')
    })
})
