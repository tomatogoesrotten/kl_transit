import { describe, expect, it } from 'vitest'
import { activeTrains, hhmm, klNow, network, nextDepartures, prepare } from '../sim'
import type { ActiveTrain, KlTime } from '../sim'
import {
  cardNote,
  departedMs,
  departuresAt,
  distinctSelections,
  findTrain,
  runningWaits,
  selectionKey,
  selectionLabel,
  stationCard,
  trainCard,
  trainSelection,
  routeLabel,
  routeName,
  vehicleCard,
  vehicleHover,
  whyLost,
} from './inspect'
import type { LiveVehicle } from '../live/feed'
import type { Selection, TrainSelection, VehicleSelection } from './store'
import type { BusMotion } from './inspect'
import { CARD_ROWS } from './readout'

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

describe('distinctSelections', () => {
  const train = (dep: number, lineId = 'AG', dir: 0 | 1 = 0): TrainSelection => ({
    kind: 'train',
    lineId,
    dir,
    dep,
    departedMs: 0,
  })

  it('drops the picks that were neither a train nor a station', () => {
    expect(distinctSelections([null, null])).toEqual([])
  })

  it('keeps the order the picker reported, topmost first', () => {
    const picks = [train(100), train(200), train(300)]
    expect(distinctSelections(picks)).toEqual(picks)
  })

  it('counts the two directions of one line as two things', () => {
    // The whole reason this exists: trains keep left, so the two directions run
    // a few pixels apart and one click covers both.
    expect(distinctSelections([train(100, 'AG', 0), train(100, 'AG', 1)])).toHaveLength(2)
  })

  it('counts one train picked twice as one thing', () => {
    // Not by `ActiveTrain.id`, which midnight and a forced timetable rename.
    const again: TrainSelection = { ...train(100), departedMs: 999 }
    expect(distinctSelections([train(100), again])).toEqual([train(100)])
  })

  it('separates a train from the platform it is standing at', () => {
    const station = { kind: 'station', lineId: 'AG', stopId: 'AG1' } as const
    expect(distinctSelections([train(100), station, station])).toEqual([train(100), station])
  })
})

describe('selectionLabel', () => {
  it('names a train by its line and where it is going', () => {
    const label = selectionLabel(rail, {
      kind: 'train',
      lineId: 'AG',
      dir: 0,
      dep: 0,
      departedMs: 0,
    })
    expect(label).toBe(`${ag.code} to ${forward.to}`)
    // And the other direction reads differently, or the chooser would offer two
    // rows nobody could tell apart.
    expect(label).not.toBe(
      selectionLabel(rail, { kind: 'train', lineId: 'AG', dir: 1, dep: 0, departedMs: 0 }),
    )
  })

  it('names a station, and says which line it is on', () => {
    const stopId = forward.stops[0].id
    expect(selectionLabel(rail, { kind: 'station', lineId: 'AG', stopId })).toBe(
      `${rail.stations[stopId].name} · ${ag.name}`,
    )
  })

  it('says something rather than nothing for a line no longer in the data', () => {
    expect(selectionLabel(rail, { kind: 'station', lineId: 'GONE', stopId: 'ZZ9' })).toContain('ZZ9')
  })
})

// The keyboard route onto the map is the lines panel: a line's row expands to
// its stations, and each station is a button. It sidesteps pointer precision
// entirely, so the data behind every one of those buttons has to resolve.
describe('the lines panel station buttons', () => {
  it('every one of them names a real station and opens a card that describes it', () => {
    const { t } = at(PEAK)
    const trains = running(at(PEAK).ms)
    let buttons = 0
    for (const line of rail.lines) {
      const stops = line.directions.find((d) => d.dir === 0)?.stops ?? []
      expect(stops.length, line.id).toBeGreaterThan(1)
      for (const stop of stops) {
        buttons++
        // What the button shows.
        expect(rail.stations[stop.id]?.name, stop.id).toBeTruthy()
        // And what pressing it opens.
        const card = stationCard(rail, { kind: 'station', lineId: line.id, stopId: stop.id }, trains, t)
        expect(card.title, stop.id).toBe(rail.stations[stop.id].name)
        expect(card.rows.length, stop.id).toBeGreaterThan(0)
      }
    }
    expect(buttons).toBeGreaterThan(180)
  })
})

describe('live vehicles', () => {
  const NOW = 1_790_309_400_000
  const bus: LiveVehicle = {
    mode: 'bus',
    id: 'VFB2440',
    label: null,
    routeId: 'U6000',
    tripId: 'weekday_U6000_U600001_9',
    position: [101.66, 3.08],
    bearing: 235.7,
    fixSec: NOW / 1000 - 45,
  }
  const ets: LiveVehicle = {
    mode: 'ktm',
    id: '9224',
    label: 'ETS304',
    routeId: null,
    tripId: '9224',
    position: [100.48, 5.85],
    bearing: null,
    fixSec: NOW / 1000 - 75,
  }
  const busSel: VehicleSelection = { kind: 'vehicle', mode: 'bus', id: 'VFB2440' }
  const etsSel: VehicleSelection = { kind: 'vehicle', mode: 'ktm', id: '9224' }

  it('keys a vehicle by mode and feed id, apart from trains and stations', () => {
    const picked: Selection[] = [busSel, { ...busSel }, etsSel, { kind: 'station', lineId: 'AG', stopId: 'AG1' }]
    expect(selectionKey(busSel)).toBe('vehicle:bus:VFB2440')
    expect(distinctSelections(picked)).toHaveLength(3)
  })

  it('says on hover the mode, the public route with its feed id, and the age', () => {
    expect(vehicleHover(bus, NOW)).toBe('Rapid KL bus route 600 · feed id U6000 · 45 s ago')
    expect(vehicleHover(ets, NOW)).toBe('KTM ETS (intercity) ETS304 · 75 s ago')
  })

  it('shows a route the published timetable does not have as its feed id, unguessed', () => {
    const unknown = { ...bus, routeId: 'U9999' }
    expect(vehicleHover(unknown, NOW)).toBe('Rapid KL bus route U9999 (feed id) · 45 s ago')
    const card = vehicleCard(busSel, unknown, NOW)
    expect(card.title).toBe('Route U9999 (feed id)')
    expect(card.rows).toContainEqual(['Route (feed id)', 'U9999'])
    expect(card.rows.some(([label]) => label === 'Runs')).toBe(false)
  })

  it('looks route names up rather than reading them off the feed id', () => {
    expect(routeName('U3000')).toEqual({ number: '300', longName: 'Terminal Maluri ~ Lebuh Ampang', feedId: 'U3000' })
    expect(routeName('T3048').number).toBe('T304')
    expect(routeName('S6060').number).toBe('PAVILION BUKIT JALIL (PAVBJ)')
    expect(routeName('U9999')).toEqual({ number: null, longName: null, feedId: 'U9999' })
    // Not fooled by a property every object has.
    expect(routeName('toString').number).toBeNull()
    expect(routeLabel('S6060')).toBe('PAVILION BUKIT JALIL (PAVBJ) · feed id S6060')
    expect(routeLabel(null)).toBe('? (no route id)')
  })

  it('names the mode and Live GPS on the card, with the feed ids labelled as such', () => {
    const card = vehicleCard(busSel, bus, NOW)
    expect(card.pill).toBe('Rapid KL bus · Live GPS')
    expect(card.title).toBe('Route 600 · feed id U6000')
    expect(card.rows).toEqual([
      ['Route (feed id)', 'U6000'],
      ['Runs', 'Puchong Utama ~ Hab Pasar Seni'],
      ['Vehicle (plate)', 'VFB2440'],
      ['Trip (feed id)', 'weekday_U6000_U600001_9'],
      ['Last report', '45 s ago'],
    ])
    expect(card.status).toBe('')
    expect(card.canFollow).toBe(false)
  })

  it('names an ETS train by its label, with its trip id and the age', () => {
    const card = vehicleCard(etsSel, ets, NOW)
    expect(card.pill).toBe('KTM ETS (intercity) · Live GPS')
    expect(card.title).toBe('ETS304')
    expect(card.rows).toContainEqual(['Trip (feed id)', '9224'])
    expect(card.rows).toContainEqual(['Last report', '75 s ago'])
  })

  it('says a vehicle is stale past four minutes, and stopped past ten, and since when', () => {
    expect(vehicleCard(busSel, bus, NOW + 200_000).status).toMatch(/over 4 minutes/)
    expect(vehicleCard(busSel, bus, NOW + 600_000).status).toBe(
      'Stopped reporting. Its last report was 10 min ago, and it is no longer drawn.',
    )
    expect(vehicleCard(busSel, undefined, NOW).status).toMatch(/stopped reporting/)
  })

  const moving: BusMotion = { estimated: true, why: null, nextCheckMs: 12_300, noNewer: false }

  it('says on the card that a moving bus is estimated, its last GPS age, and the next check', () => {
    const card = vehicleCard(busSel, bus, NOW, moving)
    expect(card.pill).toBe('Rapid KL bus · Estimated from live GPS')
    expect(card.sub).toMatch(/^Position estimated: moved along its published route from its last GPS report/)
    expect(card.sub).toMatch(/never backwards, and for at most 150 s\.$/)
    expect(card.rows.slice(-2)).toEqual([
      ['Last GPS report', '45 s ago'],
      ['Next update', 'in 13 s'],
    ])
    expect(card.rows.length).toBeLessThanOrEqual(CARD_ROWS)
    expect(card.status).toBe('')
    expect(vehicleCard(busSel, bus, NOW, { ...moving, nextCheckMs: 0 }).rows).toContainEqual(['Next update', 'due now'])
  })

  it('says when the last check brought no newer report, rather than implying a refresh', () => {
    expect(vehicleCard(busSel, bus, NOW, { ...moving, noNewer: true }).status).toBe(
      'No newer report at the last check.',
    )
  })

  it('says a stale estimated bus stands where its estimate stopped', () => {
    expect(vehicleCard(busSel, bus, NOW + 200_000, moving).status).toBe(
      'No report for over 4 minutes. Drawn faded, standing where its estimate stopped.',
    )
  })

  it.each([
    ['no-shape', /not in the published timetable, so its route is unknown/],
    ['off-route', /more than 50 m from its published route, so it is off it/],
    ['first', /no speed can be measured yet/],
    ['ambiguous', /runs along this street both ways/],
    ['too-fast', /over 90 km\/h/],
    ['shapes-failed', /Estimated movement is unavailable/],
  ] as const)('says why a bus is at its report (%s), and never calls it estimated', (why, words) => {
    const card = vehicleCard(busSel, bus, NOW, { estimated: false, why, nextCheckMs: 5_000, noNewer: true })
    expect(card.pill).toBe('Rapid KL bus · Live GPS')
    expect(card.sub).toMatch(/^Drawn /)
    expect(card.sub).toMatch(words)
    expect(card.sub).not.toMatch(/estimated(?! movement is unavailable)/i)
    expect(card.rows).toContainEqual(['Last report', '45 s ago'])
    expect(card.rows.some(([label]) => label === 'Next update')).toBe(false)
  })

  it('never calls a bus estimated before the shapes load, or a KTM train ever', () => {
    const waiting = vehicleCard(busSel, bus, NOW, { estimated: false, why: null, nextCheckMs: 0, noNewer: false })
    expect(waiting.pill).toBe('Rapid KL bus · Live GPS')
    expect(waiting.sub).toBe('Drawn where its GPS last put it. Not predicted or smoothed between reports.')
    expect(vehicleCard(etsSel, ets, NOW, moving).pill).toBe('KTM ETS (intercity) · Live GPS')
  })

  it('says estimated on hover, with the real report age, only for a bus drawn at an estimate', () => {
    expect(vehicleHover(bus, NOW, true)).toBe('Rapid KL bus route 600 · feed id U6000 · estimated · last GPS 45 s ago')
    expect(vehicleHover(bus, NOW, false)).toBe('Rapid KL bus route 600 · feed id U6000 · 45 s ago')
    expect(vehicleHover(ets, NOW, true)).toBe('KTM ETS (intercity) ETS304 · 75 s ago')
  })

  it('labels a vehicle in a crowded pick', () => {
    expect(selectionLabel(network, busSel)).toBe('Rapid KL bus VFB2440')
    expect(selectionLabel(network, etsSel)).toBe('KTM ETS (intercity), trip 9224')
  })
})

describe('cardNote', () => {
  const busSel: VehicleSelection = { kind: 'vehicle', mode: 'bus', id: 'VFB2440' }
  const moving: BusMotion = { estimated: true, why: null, nextCheckMs: 0, noNewer: false }

  it('says scheduled for trains and stations, live GPS for vehicles at their report', () => {
    expect(cardNote({ kind: 'station', lineId: 'AG', stopId: 'AG1' })).toMatch(/^Scheduled from the published timetable/)
    expect(cardNote(busSel)).toMatch(/^Live GPS: .*Not predicted between reports\.$/)
    expect(cardNote(busSel, { ...moving, estimated: false, why: 'off-route' })).toMatch(/^Live GPS/)
  })

  it('says estimated only for a bus the map draws at an estimate, never for KTM', () => {
    expect(cardNote(busSel, moving)).toMatch(/^Estimated from live GPS/)
    expect(cardNote({ kind: 'vehicle', mode: 'ktm', id: '9224' }, moving)).toMatch(/^Live GPS/)
  })
})
