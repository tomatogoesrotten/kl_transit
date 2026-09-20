import { DAY, hhmm, nextDepartures } from '../sim'
import type { ActiveTrain, KlTime, Network, PreparedDirection, PreparedNetwork } from '../sim'
import { dur } from './format'
import type { Selection, StationSelection, TrainSelection } from './store'

/**
 * What a card says, as plain strings.
 *
 * Pure, so every piece of time arithmetic below has a test. The painting is
 * `paintCard` in readout.ts, which only has to write text into elements React
 * already put on the page.
 */
export interface CardContent {
  /** The coloured chip: a line code for a train, a stop id for a station. */
  pill: string
  /** Whose colour the chip takes. */
  lineId: string
  title: string
  sub: string
  /** What is happening right now, or why we cannot say. Empty when there is nothing. */
  status: string
  /** The heading over the table, or empty when there is no table. */
  head: string
  rows: [label: string, value: string][]
  /** True only for a train that is running, and so has a position to follow. */
  canFollow: boolean
}

/** How many departures a station card offers per direction. */
const PER_DIR = 3

/** How many stops ahead a train card lists. */
const COMING_UP = 5

const lineOf = (rail: PreparedNetwork, id: string) => rail.lines.find((l) => l.id === id)

/** A stop id to the name a person would use. The id itself if the feed has no station for it. */
const nameOf = (rail: PreparedNetwork, stopId: string) => rail.stations[stopId]?.name ?? stopId

/** "07:46 · 4 min": when it comes, and how long that is. Both, because they read differently. */
const when = (sec: number, wait: number) => `${hhmm(sec + wait)} · ${dur(wait)}`

/** ", in 4 min" — the wait as the tail of a sentence. */
const inWords = (sec: number) => (sec < 20 ? ', in a few seconds' : `, in ${dur(sec)}`)

/**
 * When a running train left its origin, as a moment on the simulated clock.
 *
 * This is what makes a selection honest later. A departure second repeats every
 * service day, so on its own it cannot tell a finished trip from a clock
 * scrubbed back before the train left. An absolute moment can.
 *
 * Which service day the departure belongs to needs no id parsing: today's pass
 * only ever holds departures at or before now, and a trip is far shorter than a
 * day, so yesterday's only ever holds ones after it.
 */
export function departedMs(train: ActiveTrain, t: KlTime, ms: number): number {
  const into = train.dep <= t.sec ? t.sec - train.dep : t.sec + DAY - train.dep
  return ms - into * 1000
}

/** Turns a picked train into the selection that will keep describing it. */
export function trainSelection(train: ActiveTrain, t: KlTime, ms: number): TrainSelection {
  return {
    kind: 'train',
    lineId: train.line.id,
    dir: train.dir.dir,
    dep: train.dep,
    departedMs: departedMs(train, t, ms),
  }
}

/** The running train a selection means, or undefined. See `TrainSelection` for why not by id. */
export function findTrain(
  trains: readonly ActiveTrain[],
  sel: TrainSelection,
): ActiveTrain | undefined {
  return trains.find(
    (tr) => tr.line.id === sel.lineId && tr.dir.dir === sel.dir && tr.dep === sel.dep,
  )
}

/**
 * Why a selected train is not among the running ones.
 *
 * The distinction the honesty rule turns on. "Trip finished" is a claim about
 * the world, and it is only true when the clock has actually run past the end
 * of the trip. The other two cases are about us, not the train.
 */
export type Lost = { why: 'early' | 'finished'; at: number } | { why: 'timetable' }

export function whyLost(sel: TrainSelection, dir: PreparedDirection, ms: number): Lost {
  const elapsed = (ms - sel.departedMs) / 1000
  if (elapsed < 0) return { why: 'early', at: sel.dep }
  // `duration` is the second the train leaves its last stop, which is exactly
  // when `progress` stops returning a position for it.
  if (elapsed >= dir.duration) return { why: 'finished', at: sel.dep + dir.duration }
  // It should be running and it is not, which means the timetable underneath it
  // changed. Saying "trip finished" here is the lie this whole type exists to
  // prevent.
  return { why: 'timetable' }
}

function lostStatus(lost: Lost, origin: string, terminus: string): string {
  if (lost.why === 'finished') {
    return `This trip finished at ${hhmm(lost.at)}. The train reached ${terminus} and left the timetable.`
  }
  if (lost.why === 'early') {
    return `This train has not left ${origin} yet on this clock. It is due away at ${hhmm(lost.at)}.`
  }
  return (
    'This train is not in the timetable now in force, so we can no longer find it. ' +
    'That is not the same as its trip having finished, and we are not going to say it was.'
  )
}

function missing(sel: Selection, what: string): CardContent {
  return {
    pill: '?',
    lineId: sel.lineId,
    title: what,
    sub: '',
    status: 'This is on a line that is not in the data any more.',
    head: '',
    rows: [],
    canFollow: false,
  }
}

/** The line, where it is going, where it began, and what it is doing now. */
export function trainCard(
  rail: PreparedNetwork,
  sel: TrainSelection,
  trains: readonly ActiveTrain[],
  ms: number,
): CardContent {
  const line = lineOf(rail, sel.lineId)
  const dir = line?.directions.find((d) => d.dir === sel.dir)
  if (!line || !dir) return missing(sel, 'Train')

  const stops = dir.stops
  const origin = nameOf(rail, stops[0].id)
  // `sel.dep` is the departure second in the train's OWN service day, so a
  // train that left at 23:50 yesterday reads 23:50 rather than a negative time.
  const head = {
    pill: line.code,
    lineId: line.id,
    title: `To ${dir.to}`,
    sub: `${line.name}. Left ${origin} at ${hhmm(sel.dep)}.`,
  }

  const train = findTrain(trains, sel)
  if (!train) {
    const terminus = nameOf(rail, stops[stops.length - 1].id)
    return {
      ...head,
      status: lostStatus(whyLost(sel, dir, ms), origin, terminus),
      head: '',
      rows: [],
      canFollow: false,
    }
  }

  // `Progress.stop` is the stop it is AT when dwelling and the one it is HEADING
  // FOR when moving, so the same index means two different things and the
  // wording has to say which.
  const here = nameOf(rail, stops[train.stop].id)
  const atLast = train.stop === stops.length - 1
  const status = train.dwelling
    ? atLast
      ? `At ${here}, its last stop.`
      : `At ${here}. Leaves at ${hhmm(sel.dep + stops[train.stop].dep)}${inWords(train.secs)}.`
    : `Next stop ${here}, arriving ${hhmm(sel.dep + stops[train.stop].arr)}${inWords(train.secs)}.`

  // A standing train's own stop is excluded: it is in the status line above,
  // and "coming up" that names where you already are is noise. Near the end of
  // a trip there are simply fewer than five left.
  const rows: [string, string][] = []
  for (let j = train.stop + (train.dwelling ? 1 : 0); j < stops.length && rows.length < COMING_UP; j++) {
    rows.push([nameOf(rail, stops[j].id), hhmm(sel.dep + stops[j].arr)])
  }

  return { ...head, status, head: 'Coming up', rows, canFollow: true }
}

/**
 * Waits, in seconds, until trains that are ALREADY RUNNING leave stop `j`.
 *
 * Taken from each train's own countdown, which is the number the map draws it
 * by — so the card cannot put a train further away than the one visibly
 * approaching. Ascending, and trains that have already passed `j` are left out.
 */
export function runningWaits(
  dir: PreparedDirection,
  lineId: string,
  j: number,
  trains: readonly ActiveTrain[],
): number[] {
  const out: number[] = []
  for (const tr of trains) {
    if (tr.line.id !== lineId || tr.dir.dir !== dir.dir || tr.stop > j) continue
    const s = tr.dir.stops[tr.stop]
    // How many seconds into its trip it is: its countdown is to that stop's
    // departure while it stands there, and to its arrival while it runs.
    const into = (tr.dwelling ? s.dep : s.arr) - tr.secs
    const wait = dir.stops[j].dep - into
    if (wait >= 0) out.push(wait)
  }
  return out.sort((a, b) => a - b)
}

/**
 * The next departures from stop `j`, in seconds from now.
 *
 * Trains that are running come first and from their own progress; the rest come
 * from the timetable. The timetable pass covers the running trains too — the
 * two agree to the second — so anything at or before the last running train is
 * that same train said twice, and is dropped.
 */
export function departuresAt(
  dir: PreparedDirection,
  lineId: string,
  j: number,
  trains: readonly ActiveTrain[],
  t: KlTime,
  count: number = PER_DIR,
): number[] {
  const out = runningWaits(dir, lineId, j, trains).slice(0, count)
  if (out.length >= count) return out
  let last = out.length ? out[out.length - 1] : -Infinity
  for (const wait of nextDepartures(dir, j, t.sec, t.today, t.yesterday, count)) {
    if (out.length >= count || wait <= last + 1e-6) continue
    out.push(wait)
    last = wait
  }
  return out
}

/** The station, and what leaves it next in each direction. */
export function stationCard(
  rail: PreparedNetwork,
  sel: StationSelection,
  trains: readonly ActiveTrain[],
  t: KlTime,
): CardContent {
  const line = lineOf(rail, sel.lineId)
  const station = rail.stations[sel.stopId]
  if (!line || !station) return missing(sel, sel.stopId)

  const rows: [string, string][] = []
  for (const dir of line.directions) {
    // Resolved inside the loop: direction 1's stop list is direction 0's
    // reversed, so one station has a different index in each direction, and an
    // index found once and reused would read the mirror-image stop.
    const j = dir.stops.findIndex((s) => s.id === sel.stopId)
    // Nothing departs from the last stop of a direction, so a terminal is not
    // offered trains in the direction they arrive from.
    if (j < 0 || j === dir.stops.length - 1) continue

    const label = `To ${dir.to}`
    const waits = departuresAt(dir, line.id, j, trains, t)
    if (!waits.length) {
      rows.push([label, 'No more trains today'])
      continue
    }
    waits.forEach((wait, i) => rows.push([i === 0 ? label : '', when(t.sec, wait)]))
  }

  return {
    pill: sel.stopId,
    lineId: line.id,
    title: station.name,
    // The feed's `full` carries the sponsor name after a dash; worth showing,
    // because that is what is written on the station.
    sub: `${line.name}${station.full !== station.name ? `. Signed as ${station.full}.` : ''}`,
    status: '',
    head: 'Next trains',
    rows,
    canFollow: false,
  }
}

export function cardContent(
  rail: PreparedNetwork,
  sel: Selection,
  trains: readonly ActiveTrain[],
  t: KlTime,
  ms: number,
): CardContent {
  return sel.kind === 'train'
    ? trainCard(rail, sel, trains, ms)
    : stationCard(rail, sel, trains, t)
}

/**
 * A selection as one string, so that two picks of the same thing can be told
 * from two different things.
 *
 * The same fields `TrainSelection` is identified by, for the same reason: the
 * renderer's `ActiveTrain.id` is renamed by midnight and by a forced timetable.
 */
export function selectionKey(sel: Selection): string {
  return sel.kind === 'train'
    ? `train:${sel.lineId}:${sel.dir}:${sel.dep}`
    : `station:${sel.lineId}:${sel.stopId}`
}

/**
 * The distinct things one click found, in the order the renderer reported them.
 *
 * A pick with a radius answers with every candidate under it. Trains keep left,
 * so the two directions of a line run a few pixels apart on purpose, and on the
 * shared corridor there are four tracks' worth of them; a train standing at a
 * platform also sits on top of its own station marker. Entries the picker
 * returned that are neither a train nor a station come in as null and are
 * dropped here.
 */
export function distinctSelections(picked: readonly (Selection | null)[]): Selection[] {
  const seen = new Set<string>()
  const out: Selection[] = []
  for (const sel of picked) {
    if (!sel) continue
    const key = selectionKey(sel)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(sel)
  }
  return out
}

/**
 * What to call a selection in a list: enough to tell it from the one beside it.
 *
 * Takes the raw `Network` rather than a prepared one so the React components
 * can call it with the data they already import. A `PreparedNetwork` satisfies
 * it too.
 */
export function selectionLabel(net: Network, sel: Selection): string {
  const line = net.lines.find((l) => l.id === sel.lineId)
  if (sel.kind === 'station') {
    return `${net.stations[sel.stopId]?.name ?? sel.stopId} · ${line?.name ?? sel.lineId}`
  }
  const dir = line?.directions.find((d) => d.dir === sel.dir)
  return dir ? `${line!.code} to ${dir.to}` : `${line?.code ?? sel.lineId} train`
}

/** "7 trains running", and the per-line tallies behind it. Hidden lines still count. */
export function runningPerLine(trains: readonly ActiveTrain[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const tr of trains) counts.set(tr.line.id, (counts.get(tr.line.id) ?? 0) + 1)
  return counts
}
