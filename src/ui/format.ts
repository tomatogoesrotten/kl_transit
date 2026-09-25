import type { DayType, KlTime } from '../sim'
import type { Rejected } from '../live/feed'
import type { ClockMode, LiveStatus, LoadState, Speed, TransitView } from './store'

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
 * How old a live report is: "45 s ago", "3 min ago".
 *
 * Exact seconds up to two minutes, then whole minutes rounded DOWN, so the
 * label turns to "4 min ago" at the very moment a vehicle turns stale. Unlike
 * `dur`, nothing is "now": a live position is always from some time ago, and
 * saying how long is the point.
 */
export function ago(sec: number): string {
  return sec < 120 ? `${Math.floor(sec)} s ago` : `${Math.floor(sec / 60)} min ago`
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

/** How each kind of unusable report is described. */
const REJECT_WORDS: Record<keyof Rejected, string> = {
  missing: 'no position given',
  nullIsland: 'reported at 0,0',
  outside: 'outside Peninsular Malaysia',
  incomplete: 'no vehicle id or time',
}

/**
 * "1 position unusable: reported at 0,0." - or empty when every report in the
 * latest response was usable. Never dropped silently, never said when there is
 * nothing to say.
 */
export function rejectLine(r: Rejected): string {
  const kinds = (Object.keys(REJECT_WORDS) as (keyof Rejected)[]).filter((k) => r[k] > 0)
  const total = kinds.reduce((n, k) => n + r[k], 0)
  if (total === 0) return ''
  const why = kinds.map((k) => (kinds.length > 1 ? `${r[k]} ${REJECT_WORDS[k]}` : REJECT_WORDS[k]))
  return `${total} position${total === 1 ? '' : 's'} unusable: ${why.join(', ')}.`
}

/**
 * One live feed's condition, in a sentence or two.
 *
 * A failure is never an empty map: it says what went wrong, when the feed last
 * answered, and how many vehicles are still drawn from before it.
 *
 * @param shown How many of this mode are drawn - held and not yet gone.
 */
export function liveStatusLine(s: LiveStatus, shown: number, nowMs: number): string {
  const since =
    s.lastOkMs === null ? 'It has not answered yet.' : `Last answered ${ago((nowMs - s.lastOkMs) / 1000)}.`
  const still = shown > 0 ? ` ${shown} still shown from earlier reports.` : ''
  const line = {
    waiting: 'Waiting for the first report.',
    ok: `${shown} shown, from live GPS.`,
    empty: `The latest response was empty.${still}`,
    unavailable: `Feed unavailable. ${since}${still}`,
    'rate-limited': `Rate-limited by the API; trying again in a minute. ${since}${still}`,
    unreadable: `The latest response could not be read. ${since}${still}`,
  }[s.state]
  const bad = rejectLine(s.rejected)
  return bad ? `${line} ${bad}` : line
}

/**
 * How buses are placed, in a phrase. Estimated only once the route shapes have
 * loaded (`estimating`); before that every bus is at its live GPS report, and
 * nothing may say estimated.
 */
const busPhrase = (estimating: boolean) =>
  estimating
    ? 'Rapid KL buses estimated between their live GPS reports, along their published routes'
    : 'Rapid KL buses at their live GPS positions'

/**
 * The caption's sentence on the live kinds of position. Since #43 a bus is an
 * estimate once the route shapes have loaded, and not before.
 */
export function liveSentence(estimating: boolean): string {
  return estimating
    ? 'KTM ETS trains are different: they are live GPS, drawn where each last reported itself. ' +
        'Rapid KL buses are estimated: each is moved along its published route from its last live ' +
        'GPS report, and corrected by the next. Both show how old their last report is, and ' +
        'appear only while the clock is at the present moment.'
    : 'Rapid KL buses and KTM ETS trains are different: they are live GPS, drawn where each last ' +
        'reported itself, and each shows how old its position is. They appear only while the ' +
        'clock is at the present moment.'
}

/** The caption's collapsed label: the view, and the honesty rule for every kind of position. */
export function captionLabel(view: TransitView, estimating: boolean): string {
  return (
    `About KL Rail, ${view} view. Train positions are scheduled, not live. ` +
    'KTM ETS positions are live GPS. ' +
    (estimating ? 'Bus positions are estimated between live GPS reports.' : 'Bus positions are live GPS.')
  )
}

/** What the chosen view puts in front, in one sentence, for the caption and the map's label. */
export function viewSentence(view: TransitView, estimating: boolean): string {
  return view === 'bus'
    ? `Bus view: ${busPhrase(estimating)}, and from zoom 14 the bus stops ` +
        'from the published bus timetable, with the rail network dimmed behind them.'
    : 'Rail view: the rail network in front, with live buses drawn small beneath it.'
}

/** The canvas's `aria-label`: what the map is of, which kind of position is which, and how to move it. */
export function mapLabel(view: TransitView, estimating: boolean): string {
  return (
    'Map of Klang Valley rail lines with trains placed by the timetable, KTM ETS trains at ' +
    `their live GPS positions, and ${busPhrase(estimating)}, each showing how old its report is. ` +
    `${viewSentence(view, estimating)} ` +
    'Arrow keys move the view, plus and minus zoom. ' +
    'Stations can be selected from the lines panel.'
  )
}

/**
 * What estimation is doing, appended to the bus status line. Empty until the
 * route shapes are ready (nothing is estimated then, and nothing says so),
 * except when they failed, which must be said.
 *
 * @param unestimated Buses drawn at their report because their trip is not in
 *   the timetable, or they are off their route.
 */
export function motionLine(state: LoadState, unestimated: { noShape: number; offRoute: number }): string {
  if (state === 'failed') {
    return 'Estimated movement is unavailable: the route shapes could not be loaded, so buses stay at their last reports.'
  }
  if (state !== 'ready') return ''
  const { noShape, offRoute } = unestimated
  const parts = [
    noShape ? `${noShape} on a trip the timetable does not have` : '',
    offRoute ? `${offRoute} off ${offRoute === 1 ? 'its' : 'their'} route` : '',
  ].filter(Boolean)
  const at = parts.length ? ` ${noShape + offRoute} at their last report: ${parts.join(', ')}.` : ''
  return `Positions estimated between reports, along each bus's route.${at}`
}

/** The bus stops' load state, said in the lines panel in the bus view. Empty when there is nothing to say. */
export function stopsLine(state: LoadState): string {
  if (state === 'loading') return 'Loading bus stops…'
  if (state === 'failed') return 'Bus stops are unavailable: the stops file could not be loaded.'
  return ''
}
