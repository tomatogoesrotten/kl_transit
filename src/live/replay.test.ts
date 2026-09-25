import { describe, expect, it } from 'vitest'
import shapesFile from '../../data/bus-shapes.json'
import fx1209 from './fixtures/bus-2026-09-25T1209-KL.pb?inline'
import fx1210 from './fixtures/bus-2026-09-25T1210-KL.pb?inline'
import a1442 from './fixtures/bus-2026-09-25T1442-KL.pb?inline'
import a1443 from './fixtures/bus-2026-09-25T1443-KL.pb?inline'
import a1444 from './fixtures/bus-2026-09-25T1444-KL.pb?inline'
import a1445 from './fixtures/bus-2026-09-25T1445-KL.pb?inline'
import b1500 from './fixtures/bus-2026-09-25T1500-KL.pb?inline'
import b1501 from './fixtures/bus-2026-09-25T1501-KL.pb?inline'
import b1502 from './fixtures/bus-2026-09-25T1502-KL.pb?inline'
import b1503 from './fixtures/bus-2026-09-25T1503-KL.pb?inline'
import b1504 from './fixtures/bus-2026-09-25T1504-KL.pb?inline'
import { prepareShapes } from './busdata'
import { decodeFeed, freshness, mergeFixes } from './feed'
import type { LiveVehicle } from './feed'
import { drawnAt, estimateAt, onFix, PREDICT_S, SPEED_FACTOR } from './estimate'
import type { Drawn, Track } from './estimate'

// Real responses replayed through the estimate at 60 frames a second, as the
// map would draw them: the #40 fixtures (12:08 and 12:10 KL) and the two
// afternoon samples from this change's samples/ (A, 14:42 to 14:45; B, 15:00 to
// 15:04). Each set is its own timeline: pooling them would join fixes 15
// minutes apart. Each response is taken in at its header's time.
//
// The one hard rule: no drawn bus ever moves backwards along its shape between
// frames, except by a single marked jump - which the spec allows only for a new
// trip, a new estimate over 250 m behind, or one that stopped short.

const SETS = {
  fixtures: [fx1209, fx1210],
  A: [a1442, a1443, a1444, a1445],
  B: [b1500, b1501, b1502, b1503, b1504],
}

const shapes = prepareShapes(shapesFile)
const shapeOf = (v: LiveVehicle) => (v.tripId ? shapes.shapes.get(shapes.trips.get(v.tripId) ?? '') : undefined) ?? null

const bytesOf = (dataUrl: string) => Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0))

function responses(urls: string[]) {
  return urls.map((u) => {
    const d = decodeFeed(bytesOf(u), 'bus')
    if (!d.ok || d.headerSec === null) throw new Error('unreadable fixture')
    return { atMs: d.headerSec * 1000, vehicles: d.vehicles }
  })
}

/** What happened when a newer report reached a bus already drawn on the same trip. */
type Landing = 'ahead' | 'hold' | 'jump'

function replay(urls: string[]) {
  const rs = responses(urls)
  let held: ReadonlyMap<string, LiveVehicle> = new Map()
  const tracks = new Map<string, Track>()
  const drawn = new Map<string, Drawn>()
  const landings: Landing[] = []
  let frames = 0
  let glidesBack = 0
  let jumpsBack = 0
  let next = 0
  const end = rs[rs.length - 1].atMs + PREDICT_S * 1000
  for (let t = rs[0].atMs; t <= end; t += 1000 / 60) {
    frames++
    let newFix = false
    while (next < rs.length && rs[next].atMs <= t) {
      const r = rs[next++]
      held = mergeFixes(held, r.vehicles, r.atMs)
      newFix = true
    }
    for (const v of held.values()) {
      if (freshness(v.fixSec, t) === 'gone') continue
      const was = tracks.get(v.id)
      let track = was
      if (newFix && (!was || was.fixSec !== v.fixSec || was.tripId !== v.tripId)) {
        track = onFix(was, v, shapeOf(v))
        tracks.set(v.id, track)
      }
      const before = drawn.get(v.id)
      const now = drawnAt(before, track!, t)
      if (!now) {
        drawn.delete(v.id)
        continue
      }
      drawn.set(v.id, now)
      if (before && before.tripId === now.tripId && before.fixSec !== now.fixSec && was?.speed != null) {
        landings.push(now.jumped ? 'jump' : now.mode === 'hold' ? 'hold' : 'ahead')
      }
      if (before && before.tripId === now.tripId && now.at < before.at) {
        if (now.jumped) jumpsBack++
        else glidesBack++
      }
    }
  }
  const share = (k: Landing) => landings.filter((l) => l === k).length / landings.length
  return {
    frames,
    glidesBack,
    jumpsBack,
    landings: landings.length,
    ahead: share('ahead'),
    hold: share('hold'),
    jump: share('jump'),
    moving: [...tracks.values()].filter((tr) => tr.speed !== null).length,
  }
}

/**
 * design.md's backtest, re-run on the same placement code the app uses: for
 * each bus with three distinct consecutive fixes on one trip, the speed between
 * the first two, times the factor, predicts the third (capped at 150 s, speeds
 * over 90 km/h skipped, as `onFix` does).
 */
function backtest(urls: string[]) {
  const rs = responses(urls)
  const seen = new Map<string, Track[]>()
  for (const r of rs) {
    for (const v of r.vehicles) {
      const list = seen.get(v.id) ?? []
      const last = list[list.length - 1]
      const track = onFix(last, v, shapeOf(v))
      if (track === last) continue
      if (!last || track.tripId !== last.tripId) list.length = 0
      list.push(track)
      seen.set(v.id, list)
    }
  }
  const errors: number[] = []
  const lags: number[] = []
  let behind = 0
  let farBehind = 0
  for (const list of seen.values()) {
    for (let i = 2; i < list.length; i++) {
      const [, second, third] = list.slice(i - 2, i + 1)
      if (second.speed === null || second.place === null || third.place === null) continue
      const predicted = estimateAt(second, third.fixSec * 1000)!
      const lag = third.place - predicted
      errors.push(Math.abs(lag))
      lags.push(lag)
      if (lag < -5) behind++
      if (lag < -250) farBehind++
    }
  }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  return {
    triples: errors.length,
    error: median(errors),
    behind: behind / errors.length,
    farBehind: farBehind / errors.length,
    lag: median(lags),
  }
}

describe('replaying the recorded responses at 60 frames a second', () => {
  for (const [name, urls] of Object.entries(SETS)) {
    it(`never glides a bus backwards along its shape (${name})`, () => {
      const r = replay(urls)
      expect(r.frames).toBeGreaterThan(60 * 60)
      // Something must actually move, or this proves nothing.
      expect(r.moving).toBeGreaterThan(100)
      expect(r.glidesBack).toBe(0)
    })
  }

  // Measured from these samples, like every pinned number in `npm test`. How
  // each correction landed, judged when the response ARRIVES (its header time),
  // which is later than design.md's backtest judges it (the fix's own time), so
  // the estimate has run further and more corrections land behind or far
  // behind: design.md expected about 72% ahead, 28% holding, 5 to 6% jumping
  // back at 0.7. (At 0.5 this replay measured A 77/18/5% and B 70/24/6%.)
  // Every jump at landing here is a correction of more than 250 m. `jumpsBack` counts every backward step over the whole replay, which
  // adds holds that ended at the 150 s limit and buses that were standing at
  // their place when corrected.
  it.each([
    ['A', 190, 0.653, 0.274, 0.074, 25],
    ['B', 279, 0.627, 0.272, 0.100, 45],
  ] as const)('lands set %s as measured', (name, landings, ahead, hold, jump, jumpsBack) => {
    const r = replay(SETS[name])
    expect(r.landings).toBe(landings)
    expect(r.ahead).toBeCloseTo(ahead, 3)
    expect(r.hold).toBeCloseTo(hold, 3)
    expect(r.jump).toBeCloseTo(jump, 3)
    expect(r.jumpsBack).toBe(jumpsBack)
  })

  it('gives the #40 fixtures no corrections to judge: two responses, so no bus has a speed before its second fix', () => {
    expect(replay(SETS.fixtures).landings).toBe(0)
  })
})

describe("design.md's backtest, on the app's own placement code", () => {
  // design.md, "How fast an estimate moves", row 0.7: A 139 m, 28%, 5%, 102 m;
  // B 128 m, 28%, 6%, 69 m, from 200 and 285 triples. Re-run here on the
  // placement `onFix` really uses, which keeps 190 and 279 of them.
  it.each([
    ['A', 190, 138, 0.274, 0.047, 101],
    ['B', 279, 129, 0.290, 0.061, 69],
  ] as const)('reproduces set %s at SPEED_FACTOR 0.7', (name, triples, error, behind, far, lag) => {
    expect(SPEED_FACTOR).toBe(0.7)
    const b = backtest(SETS[name])
    expect(b.triples).toBe(triples)
    expect(Math.round(b.error)).toBe(error)
    expect(b.behind).toBeCloseTo(behind, 3)
    expect(b.farBehind).toBeCloseTo(far, 3)
    expect(Math.round(b.lag)).toBe(lag)
  })
})
