import { describe, expect, it } from 'vitest'
import { network, pointAt, preparePath } from '../sim'
import type { LonLat } from '../sim'
import bus1Url from './fixtures/bus-2026-09-25T1209-KL.pb?inline'
import bus2Url from './fixtures/bus-2026-09-25T1210-KL.pb?inline'
import shapesFile from '../../data/bus-shapes.json'
import { prepareShapes } from './busdata'
import { decodeFeed } from './feed'
import type { LiveVehicle } from './feed'
import {
  angleBetween,
  CATCH_UP_S,
  drawnAt,
  estimateAt,
  HOLD_MAX_M,
  MAX_KMH,
  onFix,
  passesNear,
  PREDICT_S,
  SPEED_FACTOR,
} from './estimate'
import type { Drawn, Track } from './estimate'

// Every rule of the bus-estimation spec, with fixed inputs. Time is always an
// argument; nothing here reads a clock.

const { origin } = network
const T0 = 1_790_309_000 // epoch seconds, a Friday afternoon in KL
const ms = (sec: number) => sec * 1000

/** Degrees of longitude for `m` metres east, in the network's flat projection. */
const east = (m: number) => m / origin.kx
const lat0 = origin.lat

/** A straight shape 5 km due east. */
const LINE_PATH: LonLat[] = [
  [origin.lon, lat0],
  [origin.lon + east(5000), lat0],
]
const LINE = preparePath(LINE_PATH, origin)

/**
 * A round trip: 3 km east, then back west along the same street 10 m to the
 * north, as a shape that comes back along its outbound road does.
 */
const north = (m: number) => m / origin.ky
const LOOP = preparePath(
  [
    [origin.lon, lat0],
    [origin.lon + east(3000), lat0],
    [origin.lon + east(3000), lat0 + north(10)],
    [origin.lon, lat0 + north(10)],
  ],
  origin,
)

/** A bus report `m` metres along the straight shape (or `off` metres north of it). */
function fix(m: number, sec: number, over: Partial<LiveVehicle> = {}, off = 0): LiveVehicle {
  return {
    mode: 'bus',
    id: 'WXY1234',
    label: null,
    routeId: 'U3000',
    tripId: 'weekday_U3000_U300001_1',
    position: [origin.lon + east(m), lat0 + north(off)],
    bearing: 90,
    fixSec: sec,
    ...over,
  }
}

/** Two reports on one trip, `gap` seconds and `metres` apart, starting at `from` metres. */
function moving(from: number, metres: number, gap: number, at = T0): Track {
  return onFix(onFix(undefined, fix(from, at - gap), LINE), fix(from + metres, at), LINE)
}

/** Every frame at 60 a second from `fromSec` to `toSec`, returning each frame's drawing. */
function frames(start: Drawn | undefined, track: Track, fromSec: number, toSec: number) {
  const out: Drawn[] = []
  let d = start
  for (let t = ms(fromSec); t <= ms(toSec); t += 1000 / 60) {
    d = drawnAt(d, track, t)!
    out.push(d)
  }
  return out
}

describe('an estimate follows the bus along its route', () => {
  it('advances at SPEED_FACTOR of the speed measured between its last two reports', () => {
    // The spec's scenario: 300 m in 60 s, reported 20 s ago -> 70 m ahead at 0.7.
    expect(SPEED_FACTOR).toBe(0.7)
    const track = moving(1000, 300, 60)
    expect(track.speed).toBeCloseTo(5, 6)
    expect(track.still).toBeNull()
    expect(estimateAt(track, ms(T0 + 20))).toBeCloseTo(1300 + 70, 6)
    // And still moving forward.
    expect(estimateAt(track, ms(T0 + 21))!).toBeGreaterThan(estimateAt(track, ms(T0 + 20))!)
  })

  it('stops 150 s after the report it starts from', () => {
    const track = moving(1000, 300, 60)
    expect(PREDICT_S).toBe(150)
    const stop = 1300 + 5 * SPEED_FACTOR * 150
    expect(estimateAt(track, ms(T0 + 150))).toBeCloseTo(stop, 6)
    expect(estimateAt(track, ms(T0 + 200))).toBeCloseTo(stop, 6)
    expect(estimateAt(track, ms(T0 + 600))).toBeCloseTo(stop, 6)
  })

  it('stops at the end of the shape and moves no further', () => {
    const track = moving(4700, 250, 50)
    expect(estimateAt(track, ms(T0 + 100))).toBeCloseTo(LINE.total, 6)
    const [last] = frames(drawnAt(undefined, track, ms(T0))!, track, T0 + 100, T0 + 100)
    expect(last.at).toBeCloseTo(LINE.total, 6)
  })

  it('is drawn on the shape, never beside it', () => {
    // Reported 20 m north of the road: placed on it, and moved along it.
    const track = onFix(onFix(undefined, fix(1000, T0 - 60, {}, 20), LINE), fix(1300, T0, {}, 20), LINE)
    const p = pointAt(LINE, estimateAt(track, ms(T0 + 20))!, false)
    expect(p.lat).toBeCloseTo(lat0, 9)
    expect(p.bearingDeg).toBeCloseTo(90, 6)
  })

  it('uses only its own reports, never a speed field from the feed', () => {
    // The decoder keeps no speed at all, so there is nothing to be tempted by.
    const d = decodeFeed(bytesOf(bus1Url), 'bus')
    if (!d.ok) throw new Error('unreadable fixture')
    expect(Object.keys(d.vehicles[0])).not.toContain('speed')
  })
})

describe('a bus with nothing to estimate from stays at its report', () => {
  it('a trip the timetable does not have: at its reported coordinates, no shape guessed', () => {
    const track = onFix(undefined, fix(1000, T0, { tripId: 'weekday_T7890_T789002_2' }), null)
    expect(track).toMatchObject({ place: null, speed: null, still: 'no-shape' })
    expect(drawnAt(undefined, track, ms(T0 + 30))).toBeNull()
  })

  it('a report 1.9 km from its route: at that reported position, not moving', () => {
    const track = onFix(moving(1000, 300, 60), fix(1400, T0 + 60, {}, 1900), LINE)
    expect(track).toMatchObject({ place: null, speed: null, still: 'off-route' })
    expect(drawnAt(undefined, track, ms(T0 + 90))).toBeNull()
  })

  it('a first report: at its place on the route, not moving, until a second gives a speed', () => {
    const track = onFix(undefined, fix(1000, T0), LINE)
    expect(track).toMatchObject({ speed: null, still: 'first' })
    expect(track.place).toBeCloseTo(1000, 6)
    const drawn = frames(undefined, track, T0, T0 + 60)
    expect(new Set(drawn.map((d) => d.at))).toEqual(new Set([track.place]))
  })

  it('a speed over 90 km/h: the reports were matched wrongly, so it does not move', () => {
    // 1600 m in 60 s is 96 km/h.
    const track = moving(1000, 1600, 60)
    expect(1600 / 60 * 3.6).toBeGreaterThan(MAX_KMH)
    expect(track).toMatchObject({ speed: null, still: 'too-fast' })
    expect(estimateAt(track, ms(T0 + 60))).toBe(track.place)
  })
})

describe('a shape that passes the same street twice', () => {
  const at = (m: number, bearing: number | null) =>
    onFix(undefined, fix(m, T0, { bearing }, 5), LOOP)

  it('finds both passes of the street', () => {
    expect(passesNear(LOOP, origin.lon + east(1000), lat0 + north(5))).toHaveLength(2)
  })

  it('takes the outbound pass for a bus heading the way it runs', () => {
    expect(at(1000, 85).place).toBeCloseTo(1000, 0)
  })

  it('takes the return pass for a bus heading back', () => {
    // 3000 out, 10 across, then 2000 back to reach x = 1000.
    expect(at(1000, 268).place).toBeCloseTo(5010, 0)
  })

  it('leaves the bus at its coordinates when its bearing matches neither pass', () => {
    expect(at(1000, 0)).toMatchObject({ place: null, still: 'ambiguous' })
  })

  it('and when it reports no bearing at all', () => {
    expect(at(1000, null)).toMatchObject({ place: null, still: 'ambiguous' })
  })

  it('lets an earlier report on the trip settle it: the pass just ahead of the last place', () => {
    const first = at(1000, 85)
    // A stationary bus's junk bearing would match neither; its last place settles it.
    const next = onFix(first, fix(1300, T0 + 60, { bearing: 0 }, 5), LOOP)
    expect(next.place).toBeCloseTo(1300, 0)
    expect(next.speed).toBeCloseTo(5, 3)
  })

  it('reads a bearing across north correctly', () => {
    expect(angleBetween(350, 10)).toBe(20)
    expect(angleBetween(10, 350)).toBe(20)
    expect(angleBetween(90, 270)).toBe(180)
  })
})

describe('a new report corrects the estimate without driving backwards', () => {
  // A bus measured at 10 m/s (drawn at 7), drawn for the 60 s after its report
  // at 1300 m. Each case's next report is made at T0 + 60 and received at once.
  const before = moving(700, 600, 60)
  const drawnBefore = frames(undefined, before, T0, T0 + 60).at(-1)!
  const was = drawnBefore.at // about 1720
  const after = (m: number) => onFix(before, fix(m, T0 + 60), LINE)

  it('catches up forward over a few seconds when the new estimate is 200 m ahead', () => {
    const track = after(was + 200)
    const run = frames(drawnBefore, track, T0 + 60, T0 + 60 + CATCH_UP_S + 1)
    expect(run[0].mode).toBe('catch-up')
    expect(run[0].at).toBe(was)
    // No jump: each frame moves forward by far less than the gap.
    for (let i = 1; i < run.length; i++) {
      expect(run[i].at).toBeGreaterThanOrEqual(run[i - 1].at)
      expect(run[i].at - run[i - 1].at).toBeLessThan(10)
    }
    const done = run.at(-1)!
    expect(done.mode).toBe('follow')
    // Caught up: now on the estimate itself, which has moved on from 200 m ahead.
    expect(done.at).toBeGreaterThan(was + 200)
  })

  it('stands still when the new estimate is 130 m behind, then moves on from there', () => {
    const track = after(was - 130)
    const drawnSpeed = track.speed! * SPEED_FACTOR // 290 m in 60 s, times 0.7
    const run = frames(drawnBefore, track, T0 + 60, T0 + 60 + 130 / drawnSpeed + 2)
    expect(run[0].mode).toBe('hold')
    const holding = run.filter((d) => d.mode === 'hold')
    expect(new Set(holding.map((d) => d.at))).toEqual(new Set([was]))
    // Held for as long as the estimate takes to cover the 130 m: about 38 s.
    expect(holding.length).toBeCloseTo((130 / drawnSpeed) * 60, -1)
    const moved = run.at(-1)!
    expect(moved.mode).toBe('follow')
    expect(moved.at).toBeGreaterThan(was)
    expect(run.some((d) => d.jumped)).toBe(false)
  })

  it('is moved back in one step when the new estimate stops before reaching it', () => {
    // Nearly stopped: 10 m in 60 s, so 150 s of estimate covers 17.5 m of a 200 m gap.
    const slow = onFix(onFix(undefined, fix(was - 210, T0 + 0), LINE), fix(was - 200, T0 + 60), LINE)
    const run = frames(drawnBefore, slow, T0 + 60, T0 + 60 + PREDICT_S + 1)
    expect(run[0].mode).toBe('hold')
    const jumpAt = run.findIndex((d) => d.jumped)
    expect(jumpAt).toBeGreaterThan(0)
    // Held still until the estimate stopped, then one step back to it.
    for (const d of run.slice(0, jumpAt)) expect(d.at).toBe(was)
    expect(run[jumpAt].at).toBeCloseTo(estimateAt(slow, ms(T0 + 60 + PREDICT_S))!, 6)
    expect(run[jumpAt].at).toBeLessThan(was)
  })

  it('is moved in one step, not glided, when the new estimate is 600 m behind', () => {
    const track = after(was - 600)
    expect(600).toBeGreaterThan(HOLD_MAX_M)
    const d = drawnAt(drawnBefore, track, ms(T0 + 60))!
    expect(d.jumped).toBe(true)
    expect(d.at).toBeCloseTo(estimateAt(track, ms(T0 + 60))!, 6)
  })

  it('is moved in one step to a new trip, and stands there until a second report on it', () => {
    const track = onFix(before, fix(200, T0 + 60, { tripId: 'weekday_U3000_U300002_2' }), LINE)
    expect(track).toMatchObject({ speed: null, still: 'first' })
    const run = frames(drawnBefore, track, T0 + 60, T0 + 120)
    expect(run[0].jumped).toBe(true)
    expect(new Set(run.map((d) => d.at))).toEqual(new Set([track.place]))
  })

  it('never glides backwards: every backward move is a single marked jump', () => {
    // Reports landing ahead, behind, far behind, and too fast to trust, drawn
    // at 60 frames a second.
    const reports = [
      fix(1000, T0),
      fix(1300, T0 + 60),
      fix(1420, T0 + 120), // 130 m behind the drawn bus when it arrives: it holds
      fix(1900, T0 + 180),
      fix(1400, T0 + 240),
      fix(1700, T0 + 300),
      fix(4990, T0 + 360),
    ]
    let track: Track | undefined
    let d: Drawn | undefined
    let backwards = 0
    let jumps = 0
    let held = 0
    for (let i = 0; i < reports.length; i++) {
      track = onFix(track, reports[i], LINE)
      // Each report is received 20 s after it was made, and drawn until the next.
      const until = (reports[i + 1]?.fixSec ?? T0 + 600) + 20
      for (let t = ms(reports[i].fixSec + 20); t < ms(until); t += 1000 / 60) {
        const next = drawnAt(d, track, t)!
        if (d && next.at < d.at) {
          backwards++
          expect(next.jumped, `glided back at ${t}`).toBe(true)
        }
        if (next.jumped) jumps++
        if (next.mode === 'hold') held++
        d = next
      }
    }
    // The run does go backwards - as marked jumps, never as a glide.
    expect(backwards).toBeGreaterThan(0)
    expect(jumps).toBeGreaterThanOrEqual(backwards)
    // And it did hold for a report that landed behind, rather than easing back.
    expect(held).toBeGreaterThan(60)
  })
})

describe('estimates are computed from supplied time alone', () => {
  it('gives identical results for the same inputs twice', () => {
    const a = moving(1000, 300, 60)
    const b = moving(1000, 300, 60)
    expect(a).toEqual(b)
    const d = drawnAt(undefined, a, ms(T0 + 10))!
    expect(drawnAt(d, a, ms(T0 + 20))).toEqual(drawnAt(d, b, ms(T0 + 20)))
    expect(estimateAt(a, ms(T0 + 33))).toBe(estimateAt(b, ms(T0 + 33)))
  })

  it('ignores a report no newer than the one it has', () => {
    const track = moving(1000, 300, 60)
    expect(onFix(track, fix(900, T0), LINE)).toBe(track)
    expect(onFix(track, fix(900, T0 - 30), LINE)).toBe(track)
  })
})

// Loaded as base64 through Vite, as feed.test.ts does.
function bytesOf(dataUrl: string) {
  return Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0))
}

describe('a real bus from the recorded responses', () => {
  // Bus VFB2440 on route 300 (trip weekday_U6000_U600001_9), reported at 12:08
  // and 12:09:54 KL. Measured from this snapshot, like network.test.ts.
  const shapes = prepareShapes(shapesFile)
  const [a, b] = [bus1Url, bus2Url].map((u) => {
    const d = decodeFeed(bytesOf(u), 'bus')
    if (!d.ok) throw new Error('unreadable fixture')
    return d.vehicles.find((v) => v.id === 'VFB2440')!
  })
  const shape = shapes.shapes.get(shapes.trips.get(a.tripId!)!)!

  it('is placed on its shape, and moves along it at 0.7 of its measured speed', () => {
    expect(a.tripId).toBe('weekday_U6000_U600001_9')
    expect(b.fixSec - a.fixSec).toBe(107)
    const track = onFix(onFix(undefined, a, shape), b, shape)
    expect(track.still).toBeNull()
    expect(Math.round(track.place!)).toBe(10578)
    expect(track.speed! * 3.6).toBeCloseTo(10.9, 1)
    const in20 = estimateAt(track, ms(b.fixSec + 20))!
    expect(in20 - track.place!).toBeCloseTo(track.speed! * SPEED_FACTOR * 20, 6)
    // The drawn point is on the road the bus reported from, heading its way.
    const p = pointAt(shape, track.place!, false)
    expect(Math.hypot((p.lon - b.position[0]) * origin.kx, (p.lat - b.position[1]) * origin.ky)).toBeLessThan(20)
    expect(angleBetween(p.bearingDeg, b.bearing!)).toBeLessThan(30)
  })
})
