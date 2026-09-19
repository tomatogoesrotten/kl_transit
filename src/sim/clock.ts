import type { DayType, KlTime } from './types'

// Kuala Lumpur is UTC+8 all year, with no daylight saving.
const KL_OFFSET_MS = 8 * 3600e3
const DAY_MS = 86400e3

export function svcOf(dow: number): DayType {
  return dow === 0 ? 'Sun' : dow === 6 ? 'Sat' : 'MonFri'
}

/**
 * Kuala Lumpur wall clock for a UTC timestamp.
 *
 * Shift the epoch by +08:00 and then read only the getUTC* fields: that gives KL
 * time on a host in any zone, with no date library. The shifted Date is a lie in
 * every other respect - getHours() or toLocaleDateString() on it would add the
 * host's own offset a second time - so it never leaves this function.
 *
 * With an explicit `override`, both today and yesterday take that day type.
 */
export function klNow(epochMs: number, override: 'auto' | DayType = 'auto'): KlTime {
  const k = new Date(epochMs + KL_OFFSET_MS)
  const dow = k.getUTCDay()
  return {
    year: k.getUTCFullYear(),
    month: k.getUTCMonth() + 1,
    day: k.getUTCDate(),
    dow,
    sec:
      k.getUTCHours() * 3600 +
      k.getUTCMinutes() * 60 +
      k.getUTCSeconds() +
      k.getUTCMilliseconds() / 1000,
    today: override === 'auto' ? svcOf(dow) : override,
    yesterday: override === 'auto' ? svcOf((dow + 6) % 7) : override,
  }
}

/** The timestamp for `sec` past midnight on the same Kuala Lumpur day. */
export function setTimeOfDay(epochMs: number, sec: number): number {
  const kl = epochMs + KL_OFFSET_MS
  return kl - (kl % DAY_MS) - KL_OFFSET_MS + sec * 1000
}

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0')

/** Seconds after midnight as "HH:MM", wrapping so that -60 reads 23:59. */
export function hhmm(sec: number): string {
  const s = ((sec % 86400) + 86400) % 86400
  return `${pad(s / 3600)}:${pad((s % 3600) / 60)}`
}
