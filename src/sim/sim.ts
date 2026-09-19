import type {
  ActiveTrain,
  DayType,
  Point,
  PreparedDirection,
  PreparedLine,
  PreparedNetwork,
  Progress,
} from './types'

export const DAY = 86400

/** First index where arr[i] >= x, or arr.length if there is none. */
export function lowerBound(arr: number[], x: number): number {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (arr[m] < x) lo = m + 1
    else hi = m
  }
  return lo
}

/** Where is a train that departed `offset` seconds ago? Metres along the track, plus what it is doing. */
export function progress(dir: PreparedDirection, offset: number): Progress | null {
  const s = dir.stops
  let i = 0
  while (i < s.length && offset >= s[i].dep) i++
  if (i >= s.length) return null // trip finished

  // i === 0 means the train is still in the dwell at its origin terminal. Every
  // direction in this feed has stops[0].arr === 0, so the `offset >= arr` test
  // below would catch it anyway - but say so rather than indexing s[-1] and hoping.
  if (i === 0 || offset >= s[i].arr) {
    return { at: s[i].at, dwelling: true, stop: i, secs: s[i].dep - offset }
  }

  const a = s[i - 1]
  const b = s[i]
  const run = b.arr - a.dep
  // A run scheduled to take no time would divide by zero; call the train arrived.
  if (run <= 0) return { at: b.at, dwelling: true, stop: i, secs: b.dep - offset }
  const f = (offset - a.dep) / run
  const eased = f * f * (3 - 2 * f) // pull away gently, brake gently
  return { at: a.at + (b.at - a.at) * eased, dwelling: false, stop: i, secs: b.arr - offset }
}

/** Metres along the track -> position and heading. */
export function pointAt(line: PreparedLine, at: number, reversed: boolean): Point {
  const d = Math.max(0, Math.min(line.total, reversed ? line.total - at : at))
  let lo = 0
  let hi = line.cum.length - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (line.cum[m] <= d) lo = m
    else hi = m
  }
  // `|| 1`, not `??`: duplicate path vertices give a zero-length segment, and
  // dividing by zero is NaN, which `??` would not catch.
  const seg = line.cum[hi] - line.cum[lo] || 1
  const f = (d - line.cum[lo]) / seg
  const dx = line.xs[hi] - line.xs[lo]
  const dz = line.zs[hi] - line.zs[lo]
  const x = line.xs[lo] + dx * f
  const z = line.zs[lo] + dz * f
  const sign = reversed ? -1 : 1
  const tx = (sign * dx) / seg
  const tz = (sign * dz) / seg

  const { lon, lat, kx, ky } = line.origin
  return {
    lon: lon + x / kx,
    lat: lat - z / ky, // minus: z runs south
    // The tangent is in metres: tx is the eastward component and -tz the
    // northward one, so atan2(east, north) is a compass bearing. Taking it from
    // longitude and latitude deltas instead would tilt every bearing, because a
    // degree of longitude here is not the same distance as a degree of latitude.
    bearingDeg: ((Math.atan2(tx, -tz) * 180) / Math.PI + 360) % 360,
  }
}

/**
 * Every train running at `nowSec` seconds after Kuala Lumpur midnight.
 *
 * A train that left before midnight is still running on yesterday's timetable,
 * so both service days are checked. The order of the result is part of the
 * contract the golden file pins: lines in file order, direction 0 then 1,
 * today's departures then yesterday's, each ascending.
 */
export function activeTrains(
  net: PreparedNetwork,
  nowSec: number,
  svcToday: DayType,
  svcYesterday: DayType,
): ActiveTrain[] {
  const out: ActiveTrain[] = []
  const passes: [DayType, number][] = [
    [svcToday, 0],
    [svcYesterday, DAY],
  ]
  for (const line of net.lines) {
    for (const dir of line.directions) {
      for (const [svc, shift] of passes) {
        const deps = dir.deps[svc]
        if (!deps) continue
        const t = nowSec + shift
        // Departures recent enough to still be running, up to the present.
        for (let k = lowerBound(deps, t - dir.duration); k < deps.length && deps[k] <= t; k++) {
          const p = progress(dir, t - deps[k])
          if (!p) continue
          out.push({ ...p, line, dir, dep: deps[k], id: `${line.id}${dir.dir}${svc}${shift}_${k}` })
        }
      }
    }
  }
  return out
}

/** Next departures from stop index `j` in one direction, as seconds from now. */
export function nextDepartures(
  dir: PreparedDirection,
  j: number,
  nowSec: number,
  svcToday: DayType,
  svcYesterday: DayType,
  count: number,
): number[] {
  const out: number[] = []
  const lead = dir.stops[j].dep
  // Ported from the prototype with its bug intact: the yesterday pass runs first
  // and shares the `out.length < count` quota, so a full quota of leftovers can
  // stop today's departures being considered at all. It does not bite on this
  // feed. See design.md, "The bug in nextDepartures is ported as written".
  const passes: [DayType, number][] = [
    [svcYesterday, DAY],
    [svcToday, 0],
  ]
  for (const [svc, shift] of passes) {
    const deps = dir.deps[svc]
    if (!deps) continue
    const t = nowSec + shift
    for (let k = lowerBound(deps, t - lead); k < deps.length && out.length < count; k++) {
      out.push(deps[k] + lead - t)
    }
  }
  return out.sort((a, b) => a - b).slice(0, count)
}

/**
 * The earliest departure anywhere on the network for a day type, or null when
 * nothing runs. The prototype returned Infinity, which formats as "NaN:NaN" and
 * which the type checker cannot warn about.
 */
export function firstDeparture(net: PreparedNetwork, svc: DayType): number | null {
  let first = Infinity
  for (const line of net.lines) {
    for (const dir of line.directions) {
      const deps = dir.deps[svc]
      if (deps && deps.length) first = Math.min(first, deps[0])
    }
  }
  return first === Infinity ? null : first
}
