import { describe, expect, it } from 'vitest'
import { activeTrains, hhmm, klNow, network, nextDepartures, prepare } from '../sim'
import type { ActiveTrain, KlTime } from '../sim'
import {
  departedMs,
  departuresAt,
  findTrain,
  runningWaits,
  stationCard,
  trainCard,
  trainSelection,
  whyLost,
} from './inspect'
import type { TrainSelection } from './store'

const rail = prepare(network)
const ag = rail.lines.find((l) => l.id === 'AG')!
const forward = ag.directions.find((d) => d.dir === 0)!
const back = ag.directions.find((d) => d.dir === 1)!

/** Wednesday 17 September 2025 in Kuala Lumpur, `sec` past midnight. A weekday. */
function at(sec: number): { t: KlTime; ms: number } {
  const ms = Date.UTC(2025, 8, 17, 0, 0, 0) - 8 * 3600e3 + sec * 1000
  return { t: klNow(ms), ms }
}

/** Every train running at that moment. */
function running(ms: number): ActiveTrain[] {
  const t = klNow(ms)
  return activeTrains(rail, t.sec, t.today, t.yesterday)
}

const PEAK = 8 * 3600

describe('findTrain', () => {
  it('finds a train by line, direction and departure rather than by its id', () => {
    const { t, ms } = at(PEAK)
    const trains = running(ms)
    const train = trains.find((tr) => tr.line.id === 'AG')!
    expect(findTrain(trains, trainSelection(train, t, ms))).toBe(train)
  })

  it('still finds the same train after midnight has renamed it', () => {
    const late = at(23 * 3600 + 58 * 60)
    // Whichever train has the most of its trip still to run at two to midnight.
    const remaining = (tr: ActiveTrain) =>
      tr.dir.duration - (late.ms - departedMs(tr, late.t, late.ms)) / 1000
    const train = running(late.ms).reduce((a, b) => (remaining(b) > remaining(a) ? b : a))
    expect(remaining(train)).toBeGreaterThan(300)
    const sel = trainSelection(train, late.t, late.ms)

    // Three minutes later is the next day, so the very same train is now found
    // through yesterday's pass and its id has changed underneath it.
    const ms2 = late.ms + 180e3
    expect(klNow(ms2).day).not.toBe(late.t.day)
    const again = findTrain(running(ms2), sel)
    expect(again).toBeDefined()
    expect(again!.id).not.toBe(train.id)
    expect(again!.dep).toBe(train.dep)
    // And it is a train that has moved on, not a stale copy of the old one.
    expect(again!.at).not.toBe(train.at)
  })
})

describe('whyLost', () => {
  const sel: TrainSelection = {
    kind: 'train',
    lineId: 'AG',
    dir: 0,
    dep: PEAK,
    departedMs: at(PEAK).ms,
  }

  it('says the trip finished only once the clock is past the end of it', () => {
    expect(whyLost(sel, forward, at(PEAK + forward.duration + 60).ms)).toEqual({
      why: 'finished',
      at: PEAK + forward.duration,
    })
  })

  it('does not call a clock scrubbed back before the departure a finished trip', () => {
    expect(whyLost(sel, forward, at(PEAK - 600).ms)).toEqual({ why: 'early', at: PEAK })
  })

  it('says it is the timetable it lost, when the trip is still under way', () => {
    expect(whyLost(sel, forward, at(PEAK + 300).ms)).toEqual({ why: 'timetable' })
  })
})

describe('the train card', () => {
  it('reports the start time in the train’s own service day', () => {
    // A train that left at 23:50 belongs to yesterday, and must still read
    // 23:50 rather than a shifted or negative time.
    const dep = 23 * 3600 + 50 * 60
    const sel: TrainSelection = { kind: 'train', lineId: 'AG', dir: 0, dep, departedMs: 0 }
    const { ms } = at(600)
    expect(trainCard(rail, sel, [], ms).sub).toContain('at 23:50')
  })

  it('lists the stops still to come at the trip’s start plus each arrival offset', () => {
    const { t, ms } = at(PEAK)
    const trains = running(ms)
    const train = trains.find((tr) => tr.line.id === 'AG' && !tr.dwelling)!
    const card = trainCard(rail, trainSelection(train, t, ms), trains, ms)

    expect(card.rows.length).toBeGreaterThan(0)
    expect(card.rows.length).toBeLessThanOrEqual(5)
    card.rows.forEach(([name, clock], i) => {
      const stop = train.dir.stops[train.stop + i]
      expect(name).toBe(rail.stations[stop.id].name)
      expect(clock).toBe(hhmm(train.dep + stop.arr))
    })
  })

  it('leaves out the stop a standing train is at, and shows fewer near the end', () => {
    const { t, ms } = at(PEAK)
    const trains = running(ms)
    const standing = trains.find((tr) => tr.line.id === 'AG' && tr.dwelling)!
    const card = trainCard(rail, trainSelection(standing, t, ms), trains, ms)

    const here = rail.stations[standing.dir.stops[standing.stop].id].name
    expect(card.rows.map(([name]) => name)).not.toContain(here)
    const left = standing.dir.stops.length - standing.stop - 1
    expect(card.rows).toHaveLength(Math.min(5, left))
  })

  it('does not claim a trip finished when it is the timetable it lost', () => {
    const { t, ms } = at(PEAK)
    const train = running(ms).find((tr) => tr.line.id === 'AG')!
    const sel = trainSelection(train, t, ms)
    // The same moment, and nothing running: what forcing a different timetable
    // looks like from here.
    const card = trainCard(rail, sel, [], ms)
    expect(card.status).not.toContain('This trip finished')
    expect(card.status).toContain('no longer find')
    expect(card.canFollow).toBe(false)
  })

  it('says the trip finished when the clock really has run past its end', () => {
    const { t, ms } = at(PEAK)
    const train = running(ms).find((tr) => tr.line.id === 'AG')!
    const sel = trainSelection(train, t, ms)
    const over = at(PEAK + train.dir.duration + 120)
    const card = trainCard(rail, sel, running(over.ms), over.ms)
    expect(card.status).toContain('This trip finished')
  })
})

describe('the station card', () => {
  /** A station in the middle of the Ampang line, served both ways. */
  const middle = forward.stops[5].id

  it('resolves the stop index inside each direction, not once for both', () => {
    const j0 = forward.stops.findIndex((s) => s.id === middle)
    const j1 = back.stops.findIndex((s) => s.id === middle)
    // Direction 1's list is direction 0's reversed, so the indices differ...
    expect(j0).not.toBe(j1)
    // ...and both still name the same station.
    expect(forward.stops[j0].id).toBe(back.stops[j1].id)

    const { t } = at(PEAK)
    const card = stationCard(rail, { kind: 'station', lineId: 'AG', stopId: middle }, [], t)
    expect(card.rows.map(([label]) => label).filter(Boolean)).toEqual([
      `To ${forward.to}`,
      `To ${back.to}`,
    ])
  })

  it('offers only the direction that leaves, at either end of the line', () => {
    const { t } = at(PEAK)
    for (const [terminal, only] of [
      [forward.stops[0].id, forward.to],
      [back.stops[0].id, back.to],
    ]) {
      const card = stationCard(rail, { kind: 'station', lineId: 'AG', stopId: terminal }, [], t)
      expect(card.rows.map(([label]) => label).filter(Boolean), terminal).toEqual([`To ${only}`])
    }
  })

  it('says so plainly when there are no more trains today', () => {
    const { t } = at(PEAK)
    // One direction with no departures at all, which is what a stop looks like
    // once the last train of its service day has gone.
    const bare = { ...rail, lines: [{ ...ag, directions: [{ ...forward, deps: {} }] }] }
    const card = stationCard(bare, { kind: 'station', lineId: 'AG', stopId: middle }, [], t)
    expect(card.rows).toEqual([[`To ${forward.to}`, 'No more trains today']])
  })

  it('takes its first times from the trains that are running, and they agree', () => {
    const { t, ms } = at(PEAK)
    const trains = running(ms)
    const j = forward.stops.findIndex((s) => s.id === middle)

    const fromTrains = runningWaits(forward, 'AG', j, trains)
    expect(fromTrains.length).toBeGreaterThan(0)

    // The timetable's answer for the same station. The two must not contradict
    // each other: a train visibly approaching cannot be further away on the
    // card than it is on the map.
    const fromTable = nextDepartures(forward, j, t.sec, t.today, t.yesterday, 3)
    expect(fromTrains[0]).toBeCloseTo(fromTable[0], 6)

    const merged = departuresAt(forward, 'AG', j, trains, t)
    expect(merged[0]).toBe(fromTrains[0])
    expect(merged).toHaveLength(3)
    // Ascending, and nothing counted twice.
    expect([...merged].sort((a, b) => a - b)).toEqual(merged)
    expect(new Set(merged).size).toBe(merged.length)
  })

  it('falls back to the timetable beyond the trains that are running', () => {
    const { t } = at(PEAK)
    const j = forward.stops.findIndex((s) => s.id === middle)
    expect(departuresAt(forward, 'AG', j, [], t)).toEqual(
      nextDepartures(forward, j, t.sec, t.today, t.yesterday, 3),
    )
  })
})

describe('departedMs', () => {
  it('anchors a train to an absolute moment, whichever pass it came from', () => {
    for (const sec of [PEAK, 30, 23.5 * 3600]) {
      const { t, ms } = at(sec)
      const trains = activeTrains(rail, t.sec, t.today, t.yesterday)
      expect(trains.length).toBeGreaterThan(0)
      for (const train of trains) {
        const into = (ms - departedMs(train, t, ms)) / 1000
        // It left in the past, and no longer ago than its trip lasts.
        expect(into, train.id).toBeGreaterThanOrEqual(0)
        expect(into, train.id).toBeLessThanOrEqual(train.dir.duration)
      }
    }
  })
})
