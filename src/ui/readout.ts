import { firstDeparture, hhmm } from '../sim'
import type { ActiveTrain, KlTime, PreparedNetwork } from '../sim'
import { freshness, LIVE_MODES } from '../live/feed'
import type { LiveMode, LiveVehicle } from '../live/feed'
import { dateLine, hhmmss, liveStatusLine, shortDateLine, stateLine } from './format'
import { cardContent, runningPerLine } from './inspect'
import type { LiveStore, Selection } from './store'
import { useClock } from './store'

/**
 * The parts of the time bar that the frame loop writes to directly.
 *
 * React renders the bar when something a person changed changes. The clock, the
 * date, the timetable line and the slider's position change a few times a
 * second and would each be a re-render, which is what "keep React out of the
 * frame loop" rules out. `TimeBar` fills these in with ref callbacks, and React
 * sets them back to null when it unmounts - so every write below is guarded.
 */
export const readout = {
  time: null as HTMLElement | null,
  dateLong: null as HTMLElement | null,
  dateShort: null as HTMLElement | null,
  state: null as HTMLElement | null,
  slider: null as HTMLInputElement | null,
  notice: null as HTMLElement | null,
  jump: null as HTMLButtonElement | null,
  /**
   * True while a person is holding the slider. A plain mutable field rather
   * than React state: it is read every frame and written on every drag pixel,
   * and the slider must not be re-rendered out from under the thumb.
   */
  dragging: false,
}

/**
 * Paints the whole readout. The caller decides how often - a few times a
 * second, never once a frame.
 */
export function paintReadout(net: PreparedNetwork, t: KlTime, anyTrains: boolean) {
  const { mode, speed } = useClock.getState()

  if (readout.time) readout.time.textContent = hhmmss(t.sec)
  // Both lengths are written and CSS shows one of them, so nothing here reads
  // innerWidth - which would then be read inside the frame loop.
  if (readout.dateLong) readout.dateLong.textContent = dateLine(t)
  if (readout.dateShort) readout.dateShort.textContent = shortDateLine(t)
  if (readout.state) readout.state.textContent = stateLine(t.today, mode, speed)

  if (readout.slider && !readout.dragging) {
    const whole = Math.floor(t.sec)
    readout.slider.value = String(whole)
    // So a screen reader says "07:45" rather than "27900".
    readout.slider.setAttribute('aria-valuetext', hhmm(whole))
  }

  // The panel is shown and hidden by React; only its wording depends on time.
  if (!anyTrains && readout.notice) {
    const first = firstDeparture(net, t.today)
    readout.notice.textContent =
      first === null
        ? `No trains are scheduled at ${hhmm(t.sec)}, and this timetable has no service at any hour.`
        : `No trains are scheduled at ${hhmm(t.sec)}. The first ones leave at ${hhmm(first)}, and the last ones finish their runs after midnight.`
    // Nothing to jump to if the timetable never runs.
    if (readout.jump) readout.jump.hidden = first === null
  }
}

/** How many rows a card's table can hold: five stops ahead, or two directions of three. */
export const CARD_ROWS = 6

/**
 * The rest of the interface the frame loop writes to directly: the hover
 * description, the open card, and the per-line running counts.
 *
 * Same bargain as `readout` above, and for the same reason. Hover is the
 * sharpest case of it — it fires on every pointer movement, so a `setState` per
 * event would re-render the tree in the middle of a drag. The counts change
 * four times a second, and the card's status line and table change with the
 * clock; none of that is something a person did, so none of it is React's.
 */
export const panels = {
  tip: null as HTMLElement | null,
  pill: null as HTMLElement | null,
  title: null as HTMLElement | null,
  sub: null as HTMLElement | null,
  status: null as HTMLElement | null,
  table: null as HTMLElement | null,
  head: null as HTMLElement | null,
  rows: [] as { row: HTMLElement; label: HTMLElement; value: HTMLElement }[],
  follow: null as HTMLElement | null,
  total: null as HTMLElement | null,
  /** Line id -> the `<span>` its count is written into. */
  counts: new Map<string, HTMLElement>(),
  /** Live mode -> its count, and its feed's status line. */
  liveCounts: new Map<LiveMode, HTMLElement>(),
  liveStatus: new Map<LiveMode, HTMLElement>(),
  /** Why live vehicles are hidden, when the clock is not at the present. */
  liveNote: null as HTMLElement | null,
}

/** Shows the hover description at a point on the map, or hides it. */
export function showTip(text: string | null, x: number, y: number) {
  const tip = panels.tip
  if (!tip) return
  tip.hidden = text === null
  if (text === null) return
  tip.textContent = text
  tip.style.left = `${x}px`
  tip.style.top = `${y}px`
}

/** The per-line tallies and the network total. Hidden lines still report their trains. */
export function paintCounts(trains: readonly ActiveTrain[]) {
  const counts = runningPerLine(trains)
  for (const [id, el] of panels.counts) el.textContent = String(counts.get(id) ?? 0)
  if (panels.total) {
    panels.total.textContent =
      trains.length === 1 ? '1 train running' : `${trains.length} trains running`
  }
}

/**
 * The live group in the lines panel: a count and a status line per mode, and
 * the note that says why nothing live is drawn while the clock is elsewhere.
 * Painted with the other counts, four times a second, because the ages in the
 * status lines move with the clock.
 */
export function paintLive(
  feeds: LiveStore,
  off: ReadonlySet<LiveMode>,
  clockLive: boolean,
  nowMs: number,
) {
  if (panels.liveNote) panels.liveNote.hidden = clockLive
  for (const mode of LIVE_MODES) {
    const { held, status } = feeds[mode]
    let shown = 0
    for (const v of held.values()) if (freshness(v.fixSec, nowMs) !== 'gone') shown++
    const count = panels.liveCounts.get(mode)
    // Nothing is drawn while the clock is elsewhere, so nothing is counted.
    if (count) count.textContent = clockLive && !off.has(mode) ? String(shown) : ''
    const line = panels.liveStatus.get(mode)
    if (!line) continue
    line.textContent = !clockLive
      ? ''
      : off.has(mode)
        ? 'Switched off, and not requested.'
        : liveStatusLine(status, shown, nowMs)
    line.hidden = line.textContent === ''
  }
}

/**
 * Fills the open card. The shell — headings, close button, follow button — is
 * React's; everything that changes as the clock runs is written here.
 */
export function paintCard(
  net: PreparedNetwork,
  selection: Selection,
  trains: readonly ActiveTrain[],
  t: KlTime,
  ms: number,
  vehicle?: LiveVehicle,
) {
  const c = cardContent(net, selection, trains, t, ms, vehicle)
  if (panels.pill) panels.pill.textContent = c.pill
  if (panels.title) panels.title.textContent = c.title
  if (panels.sub) panels.sub.textContent = c.sub
  if (panels.status) {
    panels.status.textContent = c.status
    panels.status.hidden = c.status === ''
  }
  if (panels.head) panels.head.textContent = c.head
  if (panels.table) panels.table.hidden = c.rows.length === 0
  panels.rows.forEach(({ row, label, value }, i) => {
    const cells = c.rows[i]
    row.hidden = cells === undefined
    if (!cells) return
    label.textContent = cells[0]
    value.textContent = cells[1]
  })
  // React owns the button's wording and its pressed state, which change only
  // when a person presses it; the loop owns whether there is anything to
  // follow, which changes when a trip ends. Different properties, no fight.
  if (panels.follow) panels.follow.hidden = !c.canFollow
}
