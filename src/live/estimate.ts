import type { Path } from '../sim/types'
import type { LiveVehicle } from './feed'

/**
 * Moving a live bus along its route between GPS reports: predict, then correct.
 *
 * Pure, like feed.ts and src/sim: no clock, no DOM, no state held between calls.
 * The present comes in as an argument, and so does everything remembered from
 * the last frame, so every rule below is tested with fixed inputs.
 * `src/sim/purity.test.ts` scans this file.
 *
 * This is the one place a live position is NOT where the feed put it. The
 * owner relaxed "never extrapolate" for buses only (issue #43), on these terms:
 * the estimate follows the bus's own trip's published shape, at a fraction of
 * the speed measured from its own reports, for a stated time, never backwards,
 * and never where the route is unknown. The rules are the `bus-estimation`
 * spec; the numbers are design.md's "Motion" table.
 *
 * Positions are metres along a prepared shape. `pointAt` in src/sim turns them
 * into lon, lat and bearing; nothing here needs to.
 */

/**
 * The share of the measured speed a bus is moved at. Below one ON PURPOSE: a
 * bus drawn ahead of the truth has to wait for the next report to catch up, and
 * buses stop at lights and at stops. Backtested on two afternoon samples: 0.7
 * makes the next report land behind the drawn bus 28% of the time (against 16
 * to 21% at 0.5 and about 46% at 1.0), for a median lag of 70 to 100 m
 * (against 130 to 170 m at 0.5). 0.5 was picked first; the owner found it too
 * laggy on sight, so 0.7 trades more pauses for less lag. Taste within
 * design.md's table, tuned by eye.
 */
export const SPEED_FACTOR = 0.7

/**
 * How long an estimate advances after the report it starts from, in seconds.
 * Fix-to-fix gaps: median 60 s, p90 90 s, plus header lag (median 27 s) and up
 * to 30 s of polling. A normally reporting bus's next fix lands within ~150 s.
 */
export const PREDICT_S = 150

/** A report farther than this from its shape is off it. Fix-to-shape p95 was 25 to 38 m. */
export const OFF_ROUTE_M = 50

/** A place counts only where the shape runs within this of the bus's bearing. Median gap 3.3 degrees, p90 19. */
export const BEARING_TOL_DEG = 60

/**
 * A new estimate up to this far behind the drawn bus makes it stand and wait;
 * farther, it jumps. At 0.7, 5 to 6% of fixes land more than 250 m behind.
 * Standing 250 m at 17 km/h is about 50 s: a long red light.
 */
export const HOLD_MAX_M = 250

/** How long a bus takes to catch up forward with a new estimate ahead of it. Taste. */
export const CATCH_UP_S = 4

/**
 * Measured speeds above this mean the reports were matched to the wrong part of
 * the shape. Tracked speeds p99 were 60 to 66 km/h; the feed's own maximum 81.7.
 */
export const MAX_KMH = 90

/** A report up to this far behind the last place on the trip is GPS noise, not a bus reversing. */
export const NOISE_BACK_M = 60

/**
 * Places on one shape closer together than this are the same pass of the
 * street. Farther apart, the shape comes back along it (103 of 171 shapes are
 * round trips), and the bus could be on either pass.
 */
export const PASS_GAP_M = 300

/**
 * Why a bus is drawn at its report rather than moving:
 * - `no-shape`: its trip is not in the published timetable (or it names none).
 * - `off-route`: the report is more than `OFF_ROUTE_M` from its shape.
 * - `first`: no speed can be measured yet - one report on this trip so far, or
 *   one that could not be continued from the last.
 * - `ambiguous`: the shape runs along this street both ways, and the bearing
 *   does not say which.
 * - `too-fast`: its last two reports would mean over `MAX_KMH`.
 */
export type Still = 'no-shape' | 'off-route' | 'first' | 'ambiguous' | 'too-fast'

/** What is known about one bus from its reports. Replaced by `onFix`, never mutated. */
export interface Track {
  tripId: string | null
  /** The newest report's own time, epoch seconds. */
  fixSec: number
  /** That report's place along the shape, metres. Null: drawn at its reported coordinates. */
  place: number | null
  /** Measured along-shape speed, m/s, before `SPEED_FACTOR`. Null: not moving. */
  speed: number | null
  /** Why it is not moving, or null when it is. */
  still: Still | null
  /** The shape's length, so an estimate can stop at its end. */
  end: number
}

/** What was drawn for one bus on the last frame. Replaced by `drawnAt` every frame. */
export interface Drawn {
  /** Metres along the shape. */
  at: number
  tripId: string | null
  /** The report the drawing is currently following. A different one in the track means a new report. */
  fixSec: number
  /** Following the estimate, catching up with it forward, or standing until it arrives. */
  mode: 'follow' | 'catch-up' | 'hold'
  /** Where a catch-up started, and when (epoch ms). */
  from: number
  sinceMs: number
  /** True on the one frame a bus was moved in one step rather than glided. */
  jumped: boolean
}

/** One pass of the street near a report: its nearest point, and the shape's heading there. */
interface Candidate {
  at: number
  dist: number
  bearingDeg: number
}

/** The smaller angle between two compass bearings, 0 to 180. */
export function angleBetween(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180)
}

/**
 * Every pass of the shape within `OFF_ROUTE_M` of a point, ordered along it,
 * each as its nearest point. Distances are in the shape's own flat projection,
 * never geodesic (CLAUDE.md), and the heading comes from the metre-space tangent.
 */
export function passesNear(shape: Path, lon: number, lat: number): Candidate[] {
  const { origin, xs, zs, cum } = shape
  const px = (lon - origin.lon) * origin.kx
  const pz = -(lat - origin.lat) * origin.ky
  const out: Candidate[] = []
  let last = -Infinity
  for (let i = 0; i + 1 < xs.length; i++) {
    const dx = xs[i + 1] - xs[i]
    const dz = zs[i + 1] - zs[i]
    const len = cum[i + 1] - cum[i]
    // A repeated vertex has no direction; its neighbours cover the point.
    if (len <= 0) continue
    const t = Math.max(0, Math.min(1, ((px - xs[i]) * dx + (pz - zs[i]) * dz) / (len * len)))
    const dist = Math.hypot(xs[i] + dx * t - px, zs[i] + dz * t - pz)
    if (dist > OFF_ROUTE_M) continue
    const c = { at: cum[i] + len * t, dist, bearingDeg: ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360 }
    const prev = out[out.length - 1]
    // Segments are in order along the shape, so a hit within PASS_GAP_M of the
    // last one is the same pass; keep whichever point is nearer.
    if (prev && c.at - last <= PASS_GAP_M) {
      if (c.dist < prev.dist) out[out.length - 1] = c
    } else out.push(c)
    last = c.at
  }
  return out
}

/**
 * Where on its shape a report is, or why it cannot be said.
 *
 * With a place from the last report on the same trip, the pass just ahead of it
 * wins (allowing `NOISE_BACK_M` back for GPS noise): a bus moves along its route.
 * Without one, a single pass is the place; two or more are settled by the bus's
 * bearing only if exactly one runs within `BEARING_TOL_DEG` of it.
 */
function placeOn(
  shape: Path,
  fix: LiveVehicle,
  lastPlace: number | null,
): { at: number; continued: boolean } | Still {
  const passes = passesNear(shape, fix.position[0], fix.position[1])
  if (passes.length === 0) return 'off-route'
  if (lastPlace !== null) {
    const ahead = passes.find((c) => c.at >= lastPlace - NOISE_BACK_M)
    if (ahead) return { at: ahead.at, continued: true }
  }
  if (passes.length === 1) return { at: passes[0].at, continued: false }
  const bearing = fix.bearing
  const matching =
    bearing === null ? [] : passes.filter((c) => angleBetween(c.bearingDeg, bearing) <= BEARING_TOL_DEG)
  return matching.length === 1 ? { at: matching[0].at, continued: false } : 'ambiguous'
}

/**
 * A bus's track with a report taken in.
 *
 * @param track What was known before, or undefined for a bus not seen yet.
 * @param fix The report. A report no newer than the track's, on the same trip, changes nothing.
 * @param shape The shape its reported trip names in the published timetable, or
 *   null when the timetable has no such trip. Never guessed from the trip id.
 */
export function onFix(track: Track | undefined, fix: LiveVehicle, shape: Path | null): Track {
  const sameTrip = track !== undefined && fix.tripId !== null && track.tripId === fix.tripId
  if (sameTrip && fix.fixSec <= track.fixSec) return track
  const base = { tripId: fix.tripId, fixSec: fix.fixSec, end: shape?.total ?? 0 }
  if (!shape) return { ...base, place: null, speed: null, still: 'no-shape' }

  const last = sameTrip && track.place !== null ? track : null
  const p = placeOn(shape, fix, last?.place ?? null)
  if (typeof p === 'string') return { ...base, place: null, speed: null, still: p }
  if (!last || !p.continued) return { ...base, place: p.at, speed: null, still: 'first' }

  // The feed's own speed field is never used: only distance along the shape
  // over time between this bus's own reports. Noise up to NOISE_BACK_M behind
  // is a bus standing still, not one reversing.
  const speed = Math.max(0, p.at - last.place!) / (fix.fixSec - last.fixSec)
  if (speed * 3.6 > MAX_KMH) return { ...base, place: p.at, speed: null, still: 'too-fast' }
  return { ...base, place: p.at, speed, still: null }
}

/**
 * Where the estimate puts a bus now, in metres along its shape, or null when it
 * has no place on it (drawn at its reported coordinates instead).
 *
 * Advances from the report at `SPEED_FACTOR` of the measured speed for at most
 * `PREDICT_S`, and never past the shape's end. Never decreases as `nowMs` grows.
 */
export function estimateAt(track: Track, nowMs: number): number | null {
  if (track.place === null) return null
  if (track.speed === null) return track.place
  const s = Math.max(0, Math.min(PREDICT_S, nowMs / 1000 - track.fixSec))
  return Math.min(track.end, track.place + track.speed * SPEED_FACTOR * s)
}

/**
 * Whether the estimate has not yet stopped: it has a speed, is inside its time
 * limit and short of the shape's end. A measured speed of zero counts as not
 * stopped until the limit, as the spec words it ("if the new estimate stops, by
 * its time limit, before reaching it"), so a bus reported standing still is
 * held where it is drawn, then moved back at the limit - not jumped at once.
 * With no speed at all there is no estimate to wait for: it is at its report.
 */
function advancing(track: Track, nowMs: number, est: number): boolean {
  return track.speed !== null && nowMs / 1000 - track.fixSec < PREDICT_S && est < track.end
}

/**
 * What to draw for a bus this frame, from what was drawn last frame.
 *
 * Between reports it follows the estimate. When a newer report arrives:
 * - new estimate ahead: it catches up forward over `CATCH_UP_S`;
 * - behind by up to `HOLD_MAX_M`: it stands until the estimate reaches it, and
 *   if the estimate stops (its time limit, or no speed) short of it, it is moved
 *   back in one step;
 * - behind by more, or on a new trip: moved in one step.
 * It never glides backwards: every backward change is one frame with `jumped`.
 *
 * @returns null when the bus has no place on its shape; draw it at its report.
 */
export function drawnAt(prev: Drawn | undefined, track: Track, nowMs: number): Drawn | null {
  const est = estimateAt(track, nowMs)
  if (est === null) return null
  const { tripId, fixSec } = track
  const jump = (): Drawn => ({ at: est, tripId, fixSec, mode: 'follow', from: est, sinceMs: nowMs, jumped: true })
  if (!prev || prev.tripId !== tripId) return jump()

  if (prev.fixSec !== fixSec) {
    const base = { tripId, fixSec, at: prev.at, from: prev.at, sinceMs: nowMs, jumped: false }
    if (est >= prev.at) return { ...base, mode: 'catch-up' }
    if (prev.at - est <= HOLD_MAX_M && advancing(track, nowMs, est)) return { ...base, mode: 'hold' }
    return jump()
  }

  // `Math.max` with the last frame: the estimate itself never decreases, but
  // the device clock can be set back, and a bus must not glide back with it.
  if (prev.mode === 'catch-up') {
    const k = Math.max(0, Math.min(1, (nowMs - prev.sinceMs) / (CATCH_UP_S * 1000)))
    const at = Math.max(prev.at, prev.from + (est - prev.from) * k)
    return { ...prev, at, mode: k >= 1 ? 'follow' : 'catch-up', jumped: false }
  }
  if (prev.mode === 'hold') {
    if (est >= prev.at) return { ...prev, at: est, mode: 'follow', jumped: false }
    if (!advancing(track, nowMs, est)) return jump()
    return { ...prev, jumped: false }
  }
  return { ...prev, at: Math.max(prev.at, est), jumped: false }
}
