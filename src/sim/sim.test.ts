import { describe, expect, it } from 'vitest'
import {
  firstDeparture,
  hhmm,
  klNow,
  lowerBound,
  network,
  pointAt,
  prepare,
  progress,
  setTimeOfDay,
} from './index'

// Node's `process` is not in this project's `types` list, and the only thing
// these tests need from it is the time zone.
declare const process: { env: Record<string, string | undefined> }

const prepared = prepare(network)
const ampang = prepared.lines[0]

describe('prepare', () => {
  it('measures the Ampang line in the network projection', () => {
    expect(ampang.id).toBe('AG')
    // The feed states length_m 14893 for this line; we compute 14892.7.
    expect(Math.round(ampang.total * 10) / 10).toBe(14892.7)
  })

  it('expands the headway windows end-exclusively', () => {
    const deps = ampang.directions[0].deps
    expect(deps.MonFri?.length).toBe(249)
    expect(deps.Sat?.length).toBe(209)
  })

  it('takes each direction duration from its last stop', () => {
    for (const line of prepared.lines) {
      for (const dir of line.directions) {
        expect(dir.duration, `${line.id}/${dir.dir}`).toBeGreaterThan(0)
        expect(dir.duration, `${line.id}/${dir.dir}`).toBeLessThan(7200)
      }
    }
  })

  it('leaves the network it was given untouched', () => {
    const before = JSON.stringify(network)
    prepare(network)
    expect(JSON.stringify(network)).toBe(before)
  })
})

describe('lowerBound', () => {
  it('finds the first index at or after the value', () => {
    expect(lowerBound([], 5)).toBe(0)
    expect(lowerBound([10, 20, 30], 5)).toBe(0)
    expect(lowerBound([10, 20, 30], 35)).toBe(3)
    expect(lowerBound([10, 20, 20, 20, 30], 20)).toBe(1)
  })
})

describe('progress', () => {
  const dir = ampang.directions[0]

  it('holds a train at its origin terminal before it pulls away', () => {
    const p = progress(dir, 0)
    expect(p?.dwelling).toBe(true)
    expect(p?.stop).toBe(0)
  })

  it('drops a train once its trip is over', () => {
    expect(progress(dir, dir.duration + 1)).toBe(null)
  })
})

describe('pointAt', () => {
  it('clamps to the ends of the line rather than extrapolating', () => {
    const start = pointAt(ampang, -500, false)
    expect(start.lon).toBeCloseTo(ampang.path[0][0], 6)
    expect(start.lat).toBeCloseTo(ampang.path[0][1], 6)

    const last = ampang.path[ampang.path.length - 1]
    const end = pointAt(ampang, ampang.total + 500, false)
    expect(end.lon).toBeCloseTo(last[0], 6)
    expect(end.lat).toBeCloseTo(last[1], 6)
  })

  it('reports the two directions of one point 180 degrees apart', () => {
    const forward = pointAt(ampang, 5000, false)
    const backward = pointAt(ampang, ampang.total - 5000, true)
    expect(backward.lon).toBeCloseTo(forward.lon, 9)
    expect(backward.lat).toBeCloseTo(forward.lat, 9)
    const apart = ((backward.bearingDeg - forward.bearingDeg + 360) % 360)
    expect(apart).toBeCloseTo(180, 9)
  })
})

describe('firstDeparture', () => {
  it('finds 06:00 on a weekday', () => {
    expect(firstDeparture(prepared, 'MonFri')).toBe(21600)
  })
})

describe('the Kuala Lumpur clock', () => {
  // 2026-01-02 16:00 UTC is 2026-01-03 00:00 in KL: a Saturday, and a day later
  // than the UTC date, which is the case a naive conversion gets wrong.
  const epoch = Date.UTC(2026, 0, 2, 16, 0, 0)

  it('reads KL wall clock from a UTC timestamp', () => {
    expect(klNow(epoch)).toEqual({
      year: 2026,
      month: 1,
      day: 3,
      dow: 6,
      sec: 0,
      today: 'Sat',
      yesterday: 'MonFri',
    })
  })

  it('ignores the host time zone', () => {
    const tz = process.env.TZ
    process.env.TZ = 'America/New_York'
    try {
      // If the mutation did not take, the assertion below proves nothing, so
      // check that the host really is somewhere other than UTC+8 first.
      expect(new Date(epoch).getHours()).not.toBe(new Date(epoch + 8 * 3600e3).getUTCHours())
      expect(klNow(epoch).day).toBe(3)
      expect(klNow(epoch).sec).toBe(0)
    } finally {
      process.env.TZ = tz
    }
  })

  it('moves to a time of day without changing the KL date', () => {
    const at8 = setTimeOfDay(epoch, 8 * 3600)
    expect(klNow(at8).sec).toBe(28800)
    expect(klNow(at8).day).toBe(3)
  })

  it('forces both day types when a day type is overridden', () => {
    const forced = klNow(epoch, 'MonFri')
    expect(forced.today).toBe('MonFri')
    expect(forced.yesterday).toBe('MonFri')
  })

  it('formats seconds as a clock time, wrapping past midnight', () => {
    expect(hhmm(21600)).toBe('06:00')
    expect(hhmm(-60)).toBe('23:59')
  })
})
