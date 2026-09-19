import { describe, expect, it } from 'vitest'
import rawGolden from '../../reference/sim-golden.json'
import { activeTrains, network, nextDepartures, pointAt, prepare } from './index'
import type { DayType } from './index'

// reference/sim-golden.json is the recorded output of the prototype, and is
// read-only. The shapes below only name what is in the file: TypeScript infers a
// union of seven differently-shaped cases from the JSON literal (only two carry a
// `trains` array, and every `byLine` has different keys), which is awkward to
// index. One cast, here, keeps the rest of the file plain.
interface GoldenTrain {
  line: string
  dir: 0 | 1
  departedAt: number
  alongMetres: number
  dwelling: boolean
  stopIndex: number
  secsToEvent: number
  lon: number
  lat: number
  // Serialised as `1` rather than `1.0` in places, so it is a plain number.
  bearingDeg: number
}

interface GoldenCase {
  label: string
  nowSec: number
  serviceToday: DayType
  serviceYesterday: DayType
  total: number
  /** Lines with no trains are left out entirely, so case 4 is `{}`. */
  byLine: Record<string, number>
  atPlatform: number
  trains?: GoldenTrain[]
}

interface Golden {
  note: string
  cases: GoldenCase[]
  nextDepartures: {
    line: string
    dir: 0 | 1
    stopId: string
    nowSec: number
    serviceToday: DayType
    serviceYesterday: DayType
    expectedSecsFromNow: number[]
  }
}

const golden = rawGolden as unknown as Golden
const prepared = prepare(network)

// Round exactly as the golden file was written, then compare with toBe.
// toBeCloseTo(x, 1) passes on any difference under 0.05, which is the worst-case
// rounding error itself, so a value on the boundary could flake. See design.md.
const round1 = (v: number) => Math.round(v * 10) / 10
const round6 = (v: number) => Math.round(v * 1e6) / 1e6

for (const expected of golden.cases) {
  describe(`golden case: ${expected.label}`, () => {
    const trains = activeTrains(
      prepared,
      expected.nowSec,
      expected.serviceToday,
      expected.serviceYesterday,
    )

    it(`runs ${expected.total} trains`, () => {
      expect(trains.length).toBe(expected.total)
    })

    it('runs the recorded number of trains on each line', () => {
      const byLine: Record<string, number> = {}
      for (const train of trains) byLine[train.line.id] = (byLine[train.line.id] ?? 0) + 1
      expect(byLine).toEqual(expected.byLine)
    })

    it(`stops ${expected.atPlatform} of them at a platform`, () => {
      expect(trains.filter((train) => train.dwelling).length).toBe(expected.atPlatform)
    })

    // Only two of the seven cases enumerate every train.
    const expectedTrains = expected.trains
    if (expectedTrains) {
      it(`places all ${expectedTrains.length} trains where the golden file says`, () => {
        // Compared position by position, in the order activeTrains returns them:
        // that order is part of the contract, so neither side is sorted.
        expect(trains.length).toBe(expectedTrains.length)

        expectedTrains.forEach((want, i) => {
          const got = trains[i]
          const which = `train ${i} (${want.line} dir ${want.dir}, departed ${want.departedAt}s)`

          expect(got.line.id, `${which}: line`).toBe(want.line)
          expect(got.dir.dir, `${which}: dir`).toBe(want.dir)
          expect(got.dep, `${which}: departedAt`).toBe(want.departedAt)
          expect(round1(got.at), `${which}: alongMetres`).toBe(want.alongMetres)
          expect(got.dwelling, `${which}: dwelling`).toBe(want.dwelling)
          expect(got.stop, `${which}: stopIndex`).toBe(want.stopIndex)
          expect(round1(got.secs), `${which}: secsToEvent`).toBe(want.secsToEvent)

          const point = pointAt(got.line, got.at, got.dir.reversed)
          expect(round6(point.lon), `${which}: lon`).toBe(want.lon)
          expect(round6(point.lat), `${which}: lat`).toBe(want.lat)
          expect(round1(point.bearingDeg), `${which}: bearingDeg`).toBe(want.bearingDeg)
        })
      })
    }
  })
}

describe('golden case: nextDepartures', () => {
  const want = golden.nextDepartures

  it(`lists the next departures from ${want.stopId}`, () => {
    const line = prepared.lines.find((l) => l.id === want.line)
    if (!line) throw new Error(`the network has no line ${want.line}`)
    const dir = line.directions.find((d) => d.dir === want.dir)
    if (!dir) throw new Error(`line ${want.line} has no direction ${want.dir}`)

    // Look the stop up by id: its index is a property of the feed, not a constant.
    const j = dir.stops.findIndex((s) => s.id === want.stopId)
    expect(j, `${want.line} direction ${want.dir} has no stop ${want.stopId}`).toBeGreaterThan(-1)

    const got = nextDepartures(
      dir,
      j,
      want.nowSec,
      want.serviceToday,
      want.serviceYesterday,
      want.expectedSecsFromNow.length,
    )
    expect(got).toEqual(want.expectedSecsFromNow)
  })
})
