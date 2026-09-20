import type { DayType, KlTime } from '../sim'
import type { ClockMode, Speed } from './store'

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0')

/**
 * Seconds after midnight as "HH:MM:SS", wrapping so that -60 reads 23:59:00.
 *
 * `hhmm` in src/sim is minutes only, and its `pad` is not exported. A seconds
 * formatter there would need its own test and would have to satisfy the purity
 * suite, for two lines of string work that only the display wants.
 */
export function hhmmss(sec: number): string {
  const s = ((sec % 86400) + 86400) % 86400
  return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`
}

/**
 * A wait, said the way a person would say it: "now", "35 s", "4 min".
 *
 * Ported from the prototype. Nothing under twenty seconds is worth a number,
 * and the five-second rounding in between stops a countdown flickering through
 * every value on its way down.
 */
export function dur(sec: number): string {
  if (sec < 20) return 'now'
  if (sec < 90) return `${Math.round(sec / 5) * 5} s`
  return `${Math.round(sec / 60)} min`
}

/**
 * Near-black or white, whichever can be read on top of a line's own colour.
 *
 * The feed's palette runs from a pale monorail green to a dark KTM blue, so one
 * fixed text colour is unreadable on one end or the other. Relative luminance,
 * with the prototype's threshold.
 */
export function ink(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return lum > 158 ? '#15202b' : '#ffffff'
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const SVC_NAME: Record<DayType, string> = {
  MonFri: 'Weekday',
  Sat: 'Saturday',
  Sun: 'Sunday',
}

/**
 * "Saturday 20 Sep, Kuala Lumpur", built from the numbers in `KlTime`.
 *
 * `t.month` is 1-based, where the prototype read it from `getUTCMonth()` which
 * is 0-based - hence the -1. And no `Date` is constructed here on purpose:
 * formatting one would add the host's own time zone to a value that is already
 * in Kuala Lumpur terms, which is the thing `KlTime` exists to avoid.
 */
export function dateLine(t: KlTime): string {
  return `${DAYS[t.dow]} ${t.day} ${MONTHS[t.month - 1]}, Kuala Lumpur`
}

/** The same date for a phone-width screen: "Sat 20 Sep, KL time". */
export function shortDateLine(t: KlTime): string {
  return `${DAYS[t.dow].slice(0, 3)} ${t.day} ${MONTHS[t.month - 1]}, KL time`
}

/** "Weekday timetable, 60x speed": which timetable, and what the clock is doing. */
export function stateLine(today: DayType, mode: ClockMode, speed: Speed): string {
  const how =
    mode === 'live'
      ? ', live clock'
      : mode === 'paused'
        ? ', paused'
        : speed > 1
          ? `, ${speed}× speed`
          : ''
  return `${SVC_NAME[today]} timetable${how}`
}
