import {describe, it, expect} from 'vitest'
import {utilService} from '../services/util.service'
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
        // Clock skew between two machines is enough for this.
        expect(utilService.calculateTimeWithBefore(Date.now() + 5 * MIN)).toBe(t('time.justNow'))
        expect(utilService.calculateTimeWithBefore(null)).toBe('')
        expect(utilService.calculateTimeWithBefore(undefined)).toBe('')
        expect(utilService.calculateTime(undefined)).toBe('')
    })
})
