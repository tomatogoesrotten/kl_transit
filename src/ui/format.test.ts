import { describe, expect, it } from 'vitest'
import { klNow } from '../sim'
import type { KlTime } from '../sim'
import { dateLine, dur, hhmmss, ink, shortDateLine, stateLine } from './format'

describe('dur', () => {
  it('says "now" rather than counting the last few seconds down', () => {
    expect(dur(0)).toBe('now')
    expect(dur(19.9)).toBe('now')
  })

  it('rounds seconds to five, so a countdown does not flicker', () => {
    expect(dur(20)).toBe('20 s')
    expect(dur(32)).toBe('30 s')
    expect(dur(33)).toBe('35 s')
    expect(dur(89)).toBe('90 s')
  })

  it('switches to minutes at ninety seconds', () => {
    expect(dur(90)).toBe('2 min')
    expect(dur(240)).toBe('4 min')
    expect(dur(3600)).toBe('60 min')
  })
})

describe('hhmmss', () => {
  it('formats seconds after midnight', () => {
    expect(hhmmss(0)).toBe('00:00:00')
    expect(hhmmss(7 * 3600 + 45 * 60 + 9)).toBe('07:45:09')
    expect(hhmmss(86399.9)).toBe('23:59:59')
  })

  it('wraps, so a trip past midnight still reads as a time', () => {
    expect(hhmmss(-60)).toBe('23:59:00')
    expect(hhmmss(86400 + 90)).toBe('00:01:30')
  })
})

describe('dateLine', () => {
  // Saturday 20 September 2025, 22:00 in Kuala Lumpur.
  const sat = klNow(Date.UTC(2025, 8, 20, 14, 0, 0))

  it('names the day and month a Kuala Lumpur clock is on', () => {
    expect(dateLine(sat)).toBe('Saturday 20 Sep, Kuala Lumpur')
    expect(shortDateLine(sat)).toBe('Sat 20 Sep, KL time')
  })

  it('reads t.month as 1-based', () => {
    // The off-by-one that would shift every month by one and still look
    // plausible: `getUTCMonth()` was 0-based, `KlTime.month` is not.
    const jan: KlTime = { ...sat, month: 1, day: 1 }
    const dec: KlTime = { ...sat, month: 12, day: 31 }
    expect(dateLine(jan)).toContain('Jan')
    expect(dateLine(dec)).toContain('Dec')
  })
})

describe('stateLine', () => {
  it('names the timetable and what the clock is doing', () => {
    expect(stateLine('MonFri', 'live', 1)).toBe('Weekday timetable, live clock')
    expect(stateLine('Sat', 'paused', 10)).toBe('Saturday timetable, paused')
    expect(stateLine('Sun', 'running', 60)).toBe('Sunday timetable, 60× speed')
  })

  it('says nothing extra after a scrub at real speed, as the prototype did', () => {
    expect(stateLine('MonFri', 'running', 1)).toBe('Weekday timetable')
  })
})

describe('ink', () => {
  it('picks the text colour a line’s own colour can be read in', () => {
    expect(ink('#ffffff')).toBe('#15202b')
    expect(ink('#000000')).toBe('#ffffff')
    // The feed's own extremes: the Putrajaya line's yellow is the only one in
    // it light enough to need dark text.
    expect(ink('#FFCD00')).toBe('#15202b')
    expect(ink('#115740')).toBe('#ffffff')
  })
})
