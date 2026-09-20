import { describe, expect, it } from 'vitest'
import { network, pointAt, prepare } from '../sim'
import type { ActiveTrain, Mode, PreparedDirection, PreparedLine } from '../sim'
import { stationDots } from './layers'
import { keepLeft, offsetAt, offsetPoint, sharedCorridors } from './offset'
import {
  busyStations,
  halfWidth,
  lineColors,
  MODEL_URL,
  stationIndex,
  trainInstances,
  VIADUCT_M,
  yawFor,
} from './trains'

const rail = prepare(network)
const corridors = sharedCorridors(rail)
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
    // The whole point of measuring in multiples of W: a length of 5 W covers
    // the same number of pixels whatever the zoom — about 15 px — until one of
    // the bounds takes over — the cap below zoom 10.2, the floor above 16.9.
    // 5 W is the LRT model, 20 m at the floor; the boxes this replaced were
    // 10 W, and the owner asked for half.
    for (const zoom of [11, 12, 13]) {
      const mpp = (156543.03392 * Math.cos((KL.lat * Math.PI) / 180)) / 2 ** zoom
      expect((halfWidth(zoom, KL.lat) * 5) / mpp).toBeCloseTo(15.25, 6)
    }
  })
})

describe('yawFor', () => {
  /**
   * Where deck.gl sends the model's axes, for pitch = roll = 0.
   *
   * Lifted straight out of `calculateTransformMatrix` in the installed
   * @deck.gl/mesh-layers: column 0 is the image of the model's +X axis and
   * column 1 the image of its +Y, in a frame where x is east and y is north.
   * Testing against a copy of the library's own arithmetic is the only way to
   * pin a convention down; asserting `90 - b` equals `90 - b` would prove
   * nothing.
   */
  function axes(bearingDeg: number) {
    const yaw = (yawFor(bearingDeg) * Math.PI) / 180
    return {
      nose: { east: Math.cos(yaw), north: Math.sin(yaw) },
      left: { east: -Math.sin(yaw), north: Math.cos(yaw) },
    }
  }

  it('points a northbound train north', () => {
    const { nose } = axes(0)
    expect(nose.east).toBeCloseTo(0, 9)
    expect(nose.north).toBeCloseTo(1, 9)
  })

  it('points an eastbound train east', () => {
    const { nose } = axes(90)
    expect(nose.east).toBeCloseTo(1, 9)
    expect(nose.north).toBeCloseTo(0, 9)
  })

  it('turns clockwise with the bearing, rather than mirroring it', () => {
    // The check that catches a reflection. A mirrored convention gets north
    // and east right and sends everything between them the wrong way.
    const { nose } = axes(45)
    expect(nose.east).toBeCloseTo(Math.SQRT1_2, 9)
    expect(nose.north).toBeCloseTo(Math.SQRT1_2, 9)
    const south = axes(225).nose
    expect(south.east).toBeCloseTo(-Math.SQRT1_2, 9)
    expect(south.north).toBeCloseTo(-Math.SQRT1_2, 9)
  })

  it("leans the model's left flank the way keepLeft offsets", () => {
    // The model is built with +Y to the left, so the two must agree or a train
    // would be drawn facing one way and shifted off the other side.
    for (let b = 0; b < 360; b += 15) {
      const { left } = axes(b)
      const at = keepLeft({ ...KL, bearingDeg: b }, origin, 100)
      const { east, north } = offset(KL, at)
      expect(left.east).toBeCloseTo(east / 100, 6)
      expect(left.north).toBeCloseTo(north / 100, 6)
    }
  })
})

describe('trainInstances', () => {
  const colors = lineColors(rail)
  const line = rail.lines[0]
  const dir = line.directions.find((d) => d.dir === 0)!
  const W = 4

  /** A train half way along `l`, in `l`'s direction 0. */
  function halfWayAlong(l: PreparedLine): ActiveTrain {
    const d = l.directions.find((x) => x.dir === 0)!
    return { line: l, dir: d, at: l.total / 2, dwelling: false, stop: 1, secs: 30, dep: 0, id: 'x' }
  }

  it('carries the colour of its own line', () => {
    const [it0] = trainInstances([halfWayAlong(line)], W, colors, corridors, 0).LRT
    expect(it0.color).toEqual(colors.get(line.id))
  })

  it('sits to the left of the track, not on it, at viaduct height', () => {
    const train = halfWayAlong(line)
    const centre = pointAt(line, train.at, dir.reversed)
    const [it0] = trainInstances([train], W, colors, corridors, 0).LRT
    expect(metresApart([centre.lon, centre.lat], it0.position)).toBeCloseTo(W * 0.8, 6)
    expect(it0.position[2]).toBe(VIADUCT_M)
  })

  it('faces along the track', () => {
    const train = halfWayAlong(line)
    const centre = pointAt(line, train.at, dir.reversed)
    const [it0] = trainInstances([train], W, colors, corridors, 0).LRT
    expect(it0.orientation).toEqual([0, yawFor(centre.bearingDeg), 0])
  })

  it('puts every train under the model its mode is drawn with', () => {
    // One train per line, so every mode in the feed gets at least one.
    const byMode = trainInstances(rail.lines.map(halfWayAlong), W, colors, corridors, 0)
    const counted = Object.values(byMode).reduce((n, list) => n + list.length, 0)
    expect(counted).toBe(rail.lines.length)
    for (const l of rail.lines) expect(byMode[l.mode].length).toBeGreaterThan(0)
    // And no mode in the feed is missing a model to be drawn with.
    for (const mode of Object.keys(byMode)) expect(MODEL_URL[mode as Mode]).toBeTruthy()
  })

  it('gives the two directions of one track opposite orientations', () => {
    const back = line.directions.find((d) => d.dir === 1)!
    const there = trainInstances([halfWayAlong(line)], W, colors, corridors, 0).LRT[0]
    const backAgain = trainInstances(
      [{ ...halfWayAlong(line), dir: back }],
      W,
      colors,
      corridors,
      0,
    ).LRT[0]
    const turn = Math.abs(there.orientation[1] - backAgain.orientation[1]) % 360
    expect(Math.min(turn, 360 - turn)).toBeCloseTo(180, 3)
  })
})

describe('a train on a shared stretch', () => {
  const colors = lineColors(rail)
  const ag = rail.lines.find((l) => l.id === 'AG')!
  /** Well inside Ampang's 6,405 m - 14,893 m corridor and clear of the taper. */
  const ALONG = 10000
  const GAP = 40
  const W = 4

  /** Ampang at `ALONG` metres along its stored path, running one way or the other. */
  function trainAt(reversed: boolean): ActiveTrain {
    const dir = ag.directions.find((d) => d.reversed === reversed)!
    // A direction-1 train counts from its own terminal, so its `at` is the
    // stored distance turned round. Getting this wrong offsets the return
    // journey by whatever the corridor says about the wrong end of the line.
    return {
      line: ag,
      dir,
      at: reversed ? ag.total - ALONG : ALONG,
      dwelling: false,
      stop: 1,
      secs: 30,
      dep: 0,
      id: 'x',
    }
  }

  function drawnAt(): readonly number[] {
    return offsetPoint(ag, corridors, GAP, ALONG)
  }

  it('is drawn beside its own line’s track, not beside the shared alignment', () => {
    const centre = pointAt(ag, ALONG, false)
    const drawn = drawnAt()
    // The track itself has moved half a gap off the alignment...
    expect(metresApart([centre.lon, centre.lat], drawn)).toBeCloseTo(GAP / 2, 6)

    // ...and the train sits its keep-left distance from THAT, both ways round.
    for (const reversed of [false, true]) {
      const [t] = trainInstances([trainAt(reversed)], W, colors, corridors, GAP).LRT
      expect(metresApart(drawn, t.position), String(reversed)).toBeCloseTo(W * 0.8, 6)
    }
  })

  it('still keeps left of its own direction of travel', () => {
    const drawn = drawnAt()
    for (const reversed of [false, true]) {
      const p = pointAt(ag, reversed ? ag.total - ALONG : ALONG, reversed)
      const [t] = trainInstances([trainAt(reversed)], W, colors, corridors, GAP).LRT
      // Where keepLeft would put it if the drawn track were the centre line.
      const expected = keepLeft({ ...p, lon: drawn[0], lat: drawn[1] }, origin, W * 0.8)
      expect(metresApart(expected, t.position), String(reversed)).toBeCloseTo(0, 6)
    }
  })

  it('sends the two directions to opposite sides of the drawn track', () => {
    // The check that catches the sign on `reversed`. Drop it and both
    // directions pile onto one side — or, worse, onto the other line.
    const there = trainInstances([trainAt(false)], W, colors, corridors, GAP).LRT[0]
    const back = trainInstances([trainAt(true)], W, colors, corridors, GAP).LRT[0]
    expect(metresApart(there.position, back.position)).toBeCloseTo(2 * W * 0.8, 6)
  })

  it('leaves a train off the shared stretch exactly where it was', () => {
    const before = ag.directions[0].stops[0].at
    expect(offsetAt(corridors, 'AG', before)).toBe(0)
    const train = { ...trainAt(false), at: before }
    const withGap = trainInstances([train], W, colors, corridors, GAP).LRT[0]
    const without = trainInstances([train], W, colors, corridors, 0).LRT[0]
    expect(metresApart(withGap.position, without.position)).toBeCloseTo(0, 9)
  })
})

describe('busyStations', () => {
  const dots = stationDots(rail, corridors, 0)
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
