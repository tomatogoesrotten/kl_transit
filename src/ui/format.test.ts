import { describe, expect, it } from 'vitest'
import { klNow } from '../sim'
import type { KlTime } from '../sim'
import { dateLine, hhmmss, shortDateLine, stateLine } from './format'

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
