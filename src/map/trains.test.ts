import { describe, expect, it } from 'vitest'
import { network, pointAt, prepare } from '../sim'
import type { ActiveTrain, PreparedDirection, PreparedLine } from '../sim'
import { stationDots } from './layers'
import {
  busyStations,
  footprint,
  halfWidth,
  keepLeft,
  lineColors,
  stationIndex,
  trainShapes,
  VIADUCT_M,
} from './trains'

const rail = prepare(network)
const { origin } = rail
const KL = { lon: 101.699, lat: 3.146 }

/** Metres apart, in the network's own flat projection. Never haversine. */
function metresApart(a: readonly number[], b: readonly number[]) {
  return Math.hypot((a[0] - b[0]) * origin.kx, (a[1] - b[1]) * origin.ky)
}

/** How far east and north of `from` the point `to` is, in metres. */
function offset(from: { lon: number; lat: number }, to: readonly number[]) {
  return {
    east: (to[0] - from.lon) * origin.kx,
    north: (to[1] - from.lat) * origin.ky,
  }
}

describe('keepLeft', () => {
  // The sign nothing else can catch. Backwards, it moves both directions
  // symmetrically: the picture still looks fine, it is just the wrong country.
  it('puts a northbound train west of the centre line', () => {
    const at = keepLeft({ ...KL, bearingDeg: 0 }, origin, 100)
    const { east, north } = offset(KL, at)
    expect(east).toBeCloseTo(-100, 6)
    expect(north).toBeCloseTo(0, 6)
  })

  it('puts an eastbound train north of the centre line', () => {
    const at = keepLeft({ ...KL, bearingDeg: 90 }, origin, 100)
    const { east, north } = offset(KL, at)
    expect(east).toBeCloseTo(0, 6)
    expect(north).toBeCloseTo(100, 6)
  })

  it('offsets by exactly the distance asked for, at every bearing', () => {
    for (let b = 0; b < 360; b += 15) {
      const at = keepLeft({ ...KL, bearingDeg: b }, origin, 37)
      expect(metresApart([KL.lon, KL.lat], at)).toBeCloseTo(37, 6)
    }
  })

  it('sends the two directions of one track to opposite sides of it', () => {
    // Half way along, `at` and `total - at` are the same point, so the only
    // difference between these two is which way the train is facing.
    const line = rail.lines[0]
    const half = line.total / 2
    const a = keepLeft(pointAt(line, half, false), line.origin, 50)
    const b = keepLeft(pointAt(line, half, true), line.origin, 50)
    expect(metresApart(a, b)).toBeCloseTo(100, 3)
  })
})

describe('halfWidth', () => {
  it('floors at 4 m when the camera is close', () => {
    expect(halfWidth(18, KL.lat)).toBe(4)
    expect(halfWidth(22, KL.lat)).toBe(4)
  })

  it('grows as the camera pulls back', () => {
    const close = halfWidth(14, KL.lat)
    const mid = halfWidth(12, KL.lat)
    const far = halfWidth(10, KL.lat)
    expect(mid).toBeGreaterThan(close)
    expect(far).toBeGreaterThan(mid)
  })

  it('stops growing at 420 m, so a train never swallows the state', () => {
    expect(halfWidth(1, KL.lat)).toBe(420)
  })

  it('keeps the train the same size on screen between the two bounds', () => {
    // The whole point of measuring in multiples of W: a length of 10 W covers
    // the same number of pixels whatever the zoom — about 30 px — until one of
    // the bounds takes over — the cap below zoom 10.2, the floor above 16.9.
    for (const zoom of [11, 12, 13]) {
      const mpp = (156543.03392 * Math.cos((KL.lat * Math.PI) / 180)) / 2 ** zoom
      expect((halfWidth(zoom, KL.lat) * 10) / mpp).toBeCloseTo(30.5, 6)
    }
  })
})

describe('footprint', () => {
  const W = 4
  const box = footprint([KL.lon, KL.lat], 0, W, W * 5, origin, VIADUCT_M)

  it('is a 2W by 10W rectangle', () => {
    expect(box).toHaveLength(4)
    expect(metresApart(box[0], box[1])).toBeCloseTo(2 * W, 6)
    expect(metresApart(box[1], box[2])).toBeCloseTo(10 * W, 6)
    expect(metresApart(box[2], box[3])).toBeCloseTo(2 * W, 6)
    expect(metresApart(box[3], box[0])).toBeCloseTo(10 * W, 6)
  })

  it('sits at the height it was given, so it can be extruded from there', () => {
    for (const corner of box) expect(corner[2]).toBe(VIADUCT_M)
  })

  it('points along the bearing: due north puts both nose corners north', () => {
    // Corners 0 and 1 are the nose, 2 and 3 the tail.
    for (const nose of [box[0], box[1]]) expect(offset(KL, nose).north).toBeCloseTo(20, 6)
    for (const tail of [box[2], box[3]]) expect(offset(KL, tail).north).toBeCloseTo(-20, 6)
    // And the width is across the track, half each side.
    expect(offset(KL, box[0]).east).toBeCloseTo(4, 6)
    expect(offset(KL, box[1]).east).toBeCloseTo(-4, 6)
  })

  it('turns with the bearing', () => {
    const east = footprint([KL.lon, KL.lat], 90, W, W * 5, origin, 0)
    for (const nose of [east[0], east[1]]) {
      expect(offset(KL, nose).east).toBeCloseTo(20, 6)
      expect(Math.abs(offset(KL, nose).north)).toBeCloseTo(4, 6)
    }
  })
})

describe('trainShapes', () => {
  const colors = lineColors(rail)
  const line = rail.lines[0]
  const dir = line.directions.find((d) => d.dir === 0)!
  const train: ActiveTrain = {
    line,
    dir,
    at: line.total / 2,
    dwelling: false,
    stop: 1,
    secs: 30,
    dep: 0,
    id: 'test',
  }

  it('carries the colour of its own line', () => {
    const [shape] = trainShapes([train], 4, colors)
    expect(shape.color).toEqual(colors.get(line.id))
  })

  it('draws the roof on top of the body, narrower and shorter', () => {
    const W = 4
    const [shape] = trainShapes([train], W, colors)
    expect(shape.body[0][2]).toBe(VIADUCT_M)
    expect(shape.roof[0][2]).toBeCloseTo(VIADUCT_M + W * 1.7, 9)
    expect(metresApart(shape.roof[0], shape.roof[1])).toBeCloseTo(1.6 * W, 6)
    expect(metresApart(shape.roof[1], shape.roof[2])).toBeCloseTo(9.4 * W, 6)
  })

  it('sits to the left of the track, not on it', () => {
    const W = 4
    const centre = pointAt(line, train.at, dir.reversed)
    const [shape] = trainShapes([train], W, colors)
    // The body's centre is the mean of its four corners.
    const mid = [
      shape.body.reduce((n, c) => n + c[0], 0) / 4,
      shape.body.reduce((n, c) => n + c[1], 0) / 4,
    ]
    expect(metresApart([centre.lon, centre.lat], mid)).toBeCloseTo(W * 1.15, 6)
  })
})

describe('busyStations', () => {
  const dots = stationDots(rail)
  const index = stationIndex(dots)
  const line = rail.lines[0]
  const forward = line.directions.find((d) => d.dir === 0)!
  const back = line.directions.find((d) => d.dir === 1)!

  /** A train standing at stop number `i` of `dir`. */
  function dwellingAt(dir: PreparedDirection, i: number, line: PreparedLine): ActiveTrain {
    return { line, dir, at: dir.stops[i].at, dwelling: true, stop: i, secs: 10, dep: 0, id: 'x' }
  }

  it('gives every stop its own marker, with no id used twice', () => {
    expect(index.size).toBe(dots.length)
    expect(dots.length).toBeGreaterThan(180)
  })

  it('resolves both directions of a station to the same marker', () => {
    // Third stop out in direction 0 is third from the end in direction 1, so an
    // index-based lookup would light a station at the far end of the line.
    const i = 2
    const id = forward.stops[i].id
    const j = back.stops.findIndex((s) => s.id === id)
    expect(j).not.toBe(i)

    const there = busyStations([dwellingAt(forward, i, line)], index)
    const backAgain = busyStations([dwellingAt(back, j, line)], index)
    expect([...there]).toEqual([...backAgain])
    expect(dots[[...there][0]].id).toBe(id)
  })

  it('marks nothing for a train that is only heading for a station', () => {
    const moving: ActiveTrain = { ...dwellingAt(forward, 2, line), dwelling: false }
    expect(busyStations([moving], index).size).toBe(0)
  })

  it('marks one line of an interchange without marking the other', () => {
    // KL Sentral is KJ15 on the Kelana Jaya line and MR1 on the monorail, and
    // each has its own marker. Filling one must not fill the other.
    const kj = rail.lines.find((l) => l.id === 'KJ')!
    const dir = kj.directions.find((d) => d.dir === 0)!
    const i = dir.stops.findIndex((s) => s.id === 'KJ15')
    expect(i).toBeGreaterThanOrEqual(0)

    const busy = busyStations([dwellingAt(dir, i, kj)], index)
    expect(busy.has(index.get('KJ15')!)).toBe(true)
    expect(busy.has(index.get('MR1')!)).toBe(false)
  })
})
