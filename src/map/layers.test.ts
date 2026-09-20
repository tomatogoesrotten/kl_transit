import { describe, expect, it } from 'vitest'
import { network, pointAt, prepare } from '../sim'
import type { PreparedLine } from '../sim'
import {
  cameraLayers,
  hexToRgb,
  labelLayerId,
  lineLayer,
  networkLayers,
  stationDots,
} from './layers'
import { gapMetres, offsetAt, offsetPoint, sharedCorridors } from './offset'

const rail = prepare(network)
const corridors = sharedCorridors(rail)
/** A separation in metres, for the tests that need one. The app's comes from the zoom. */
const GAP = 40
const layers = networkLayers(rail, corridors, GAP, 'test-label-layer')

/** Metres apart, using the network's own flat projection of the Klang Valley. */
function metresApart(a: { lon: number; lat: number }, b: { lon: number; lat: number }) {
  return Math.hypot((a.lon - b.lon) * rail.origin.kx, (a.lat - b.lat) * rail.origin.ky)
}

/** deck.gl accessors are "a value or a function of the datum"; ours are functions. */
function accessor<In, Out>(prop: unknown): (d: In) => Out {
  if (typeof prop !== 'function') throw new Error('expected an accessor function')
  return prop as (d: In) => Out
}

describe('hexToRgb', () => {
  it('reads lowercase and uppercase alike', () => {
    expect(hexToRgb('#e57200')).toEqual([229, 114, 0])
    expect(hexToRgb('#E57200')).toEqual([229, 114, 0])
  })

  it('handles the ends of the range', () => {
    expect(hexToRgb('#000000')).toEqual([0, 0, 0])
    expect(hexToRgb('#FFFFFF')).toEqual([255, 255, 255])
  })
})

describe('the line layers', () => {
  const [lines, shared] = layers

  it('draws every line in the network, in one layer or the other', () => {
    const plain = lines.props.data as PreparedLine[]
    const offset = shared.props.data as PreparedLine[]
    expect(plain.length + offset.length).toBe(network.lines.length)
    // Split so that a zoom change, which moves only the lines sharing track,
    // never re-tessellates the rest.
    expect(offset.map((l) => l.id)).toEqual(['AG', 'PH'])
    expect(plain.some((l) => corridors.has(l.id))).toBe(false)
  })

  it('takes every colour from the data, not from the app', () => {
    for (const layer of [lines, shared]) {
      const getColor = accessor<(typeof rail.lines)[number], number[]>(layer.props.getColor)
      for (const line of layer.props.data as PreparedLine[]) {
        expect(getColor(line), line.id).toEqual(hexToRgb(line.color))
      }
    }
    // If a palette were hardcoded the lines would not differ from each other.
    expect(new Set(rail.lines.map((l) => l.color)).size).toBeGreaterThan(1)
  })

  it('gives every line its own height, so coincident geometry has an order', () => {
    const heights = new Set<number>()
    for (const layer of [lines, shared]) {
      const getPath = accessor<PreparedLine, [number, number, number][]>(layer.props.getPath)
      for (const line of layer.props.data as PreparedLine[]) {
        const z = new Set(getPath(line).map(([, , h]) => h))
        expect(z.size, line.id).toBe(1)
        heights.add([...z][0])
      }
    }
    expect(heights.size).toBe(network.lines.length)
  })
})

describe('the station layer', () => {
  const stations = layers[2]

  it('answers picks, where the track deliberately does not', () => {
    // A track is large and it is everywhere near a line, so a pickable one
    // would answer instead of the train standing on it.
    expect(stations.props.pickable).toBe(true)
    expect(layers[0].props.pickable).toBe(false)
    expect(layers[1].props.pickable).toBe(false)
  })

  it('draws every stop of every line, duplicates and all', () => {
    const total = rail.lines.reduce(
      (n, line) => n + (line.directions.find((d) => d.dir === 0)?.stops.length ?? 0),
      0,
    )
    expect(stations.props.data).toHaveLength(total)
    expect(total).toBe(stationDots(rail, corridors, GAP).length)
  })

  it('puts a station on the track, not at its published coordinate', () => {
    // No separation, so this is about the projection alone: with one, a station
    // on the shared stretch is deliberately drawn off the track it stands on.
    const dots = stationDots(rail, corridors, 0)
    // KJ37 Putra Heights is the worst case in the feed, about 105 m off its line.
    const kj37 = dots.find((d) => d.id === 'KJ37')!
    const raw = network.stations.KJ37
    const drawn = { lon: kj37.position[0], lat: kj37.position[1] }
    expect(metresApart(drawn, raw)).toBeGreaterThan(100)
    expect(metresApart(drawn, raw)).toBeLessThan(110)

    // Everything else is closer, but still moved: nothing is drawn raw.
    for (const dot of dots) {
      const station = network.stations[dot.id as keyof typeof network.stations]
      if (!station) continue
      const at = { lon: dot.position[0], lat: dot.position[1] }
      expect(metresApart(at, station), dot.id).toBeLessThan(110)
    }
  })

  it('reads `at` in direction 0, the sense the path is stored in', () => {
    // The mirroring bug: direction 1 unreversed would flip every station end for
    // end. Direction 1 reversed must land on the same point as direction 0.
    for (const line of rail.lines) {
      const forward = line.directions.find((d) => d.dir === 0)!
      const back = line.directions.find((d) => d.dir === 1)!
      for (const stop of forward.stops) {
        const other = back.stops.find((s) => s.id === stop.id)!
        const a = pointAt(line, stop.at, false)
        const b = pointAt(line, other.at, true)
        expect(metresApart(a, b), `${line.id}/${stop.id}`).toBeLessThan(1)
      }
    }
  })
})

describe('a station on a shared stretch', () => {
  const dots = stationDots(rail, corridors, GAP)
  const ag = rail.lines.find((l) => l.id === 'AG')!
  const ph = rail.lines.find((l) => l.id === 'PH')!
  // Pudu: one physical station, one stop id per line, well clear of the taper.
  const pudu = { AG: 'AG10', PH: 'SP10' }

  /** The stop's distance along its own line. */
  function atOf(line: typeof ag, id: string) {
    return line.directions.find((d) => d.dir === 0)!.stops.find((s) => s.id === id)!.at
  }

  it('sits on its own line’s drawn path, not on the alignment they share', () => {
    for (const line of [ag, ph]) {
      const id = pudu[line.id as 'AG' | 'PH']
      const at = atOf(line, id)
      const dot = dots.find((d) => d.id === id)!
      const drawn = offsetPoint(line, corridors, GAP, at)
      expect(metresApart({ lon: dot.position[0], lat: dot.position[1] }, {
        lon: drawn[0],
        lat: drawn[1],
      }), id).toBeCloseTo(0, 6)

      // And that is half a gap off the track itself.
      const centre = pointAt(line, at, false)
      expect(
        metresApart({ lon: dot.position[0], lat: dot.position[1] }, centre),
        id,
      ).toBeCloseTo(GAP / 2, 3)
    }
  })

  it('is a full gap from the other line’s marker for the same station', () => {
    const a = dots.find((d) => d.id === 'AG10')!.position
    const b = dots.find((d) => d.id === 'SP10')!.position
    expect(metresApart({ lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] })).toBeCloseTo(GAP, 1)
  })

  it('moves the markers on a shared stretch and no others', () => {
    const plain = stationDots(rail, corridors, 0)
    const moved = dots
      .filter(
        (d, i) =>
          metresApart(
            { lon: d.position[0], lat: d.position[1] },
            { lon: plain[i].position[0], lat: plain[i].position[1] },
          ) > 1e-6,
      )
      .map((d) => d.id)

    const expected: string[] = []
    for (const line of [ag, ph]) {
      for (const stop of line.directions.find((d) => d.dir === 0)!.stops) {
        if (offsetAt(corridors, line.id, stop.at) !== 0) expected.push(stop.id)
      }
    }
    expect(moved.sort()).toEqual(expected.sort())
    expect(expected.length).toBeGreaterThan(20)
  })
})

describe('cameraLayers', () => {
  const build = cameraLayers(rail, corridors, 'test-label-layer')

  it('rebuilds nothing while the zoom holds', () => {
    const a = build(12, 3.146)
    const b = build(12, 3.146)
    // The same objects, which is also how deck.gl is told nothing changed.
    expect(b).toBe(a)
    expect(b.shared).toBe(a.shared)
    expect(b.dots).toBe(a.dots)
  })

  it('rebuilds when the zoom changes, because the gap is in pixels', () => {
    const a = build(12, 3.146)
    const b = build(16, 3.146)
    expect(b).not.toBe(a)
    expect(b.shared).not.toBe(a.shared)
    expect(b.gap).toBeLessThan(a.gap)
    expect(a.gap).toBeCloseTo(gapMetres(12, 3.146), 9)
  })

  it('never touches the lines that share nothing', () => {
    // They are in `lineLayer`, built once outside this: nothing here can move
    // them, which is the point of the split.
    expect(Object.keys(build(13, 3.146))).toEqual(['shared', 'dots', 'gap'])
  })
})

describe('labelLayerId', () => {
  // Abridged from the liberty style, in its own order: a symbol layer sits below
  // the buildings (the one-way arrows), so "the first symbol" is not the answer.
  const liberty = [
    { id: 'background', type: 'background' },
    { id: 'road_motorway', type: 'line' },
    { id: 'road_one_way_arrow', type: 'symbol' },
    { id: 'building', type: 'fill' },
    { id: 'building-3d', type: 'fill-extrusion' },
    { id: 'boundary_2', type: 'line' },
    { id: 'waterway_line_label', type: 'symbol' },
    { id: 'label_city', type: 'symbol' },
  ]

  it('picks the first label above the buildings', () => {
    expect(labelLayerId(liberty)).toBe('waterway_line_label')
  })

  it('says so rather than guessing when a style has no labels', () => {
    expect(labelLayerId(liberty.filter((l) => l.type !== 'symbol'))).toBeUndefined()
  })
})

describe('hiding a line', () => {
  const build = cameraLayers(rail, corridors, 'test-label-layer')

  it('takes its track and its stations out of the data', () => {
    const hidden = new Set(['AG'])
    const cam = build(13, 3.146, hidden)
    expect((cam.shared.props.data as PreparedLine[]).map((l) => l.id)).toEqual(['PH'])
    expect(cam.dots.some((dot) => dot.line === 'AG')).toBe(false)
    expect(cam.dots.some((dot) => dot.line === 'PH')).toBe(true)

    // And the lines that share track with nobody, which live in their own layer.
    const plain = lineLayer(rail, corridors, 'test-label-layer', new Set(['KJ']))
    expect((plain.props.data as PreparedLine[]).some((l) => l.id === 'KJ')).toBe(false)
  })

  it('leaves its partner exactly where it was drawn', () => {
    // The corridors are worked out once from the WHOLE network. Recomputing
    // them from the visible subset would put Sri Petaling back on the centre
    // line the moment Ampang was switched off - 8.5 km of track moving
    // sideways because of a checkbox.
    const withBoth = build(13, 3.146)
    const getPath = accessor<PreparedLine, [number, number, number][]>(
      withBoth.shared.props.getPath,
    )
    const before = getPath(
      (withBoth.shared.props.data as PreparedLine[]).find((l) => l.id === 'PH')!,
    )
    const phBefore = withBoth.dots.filter((dot) => dot.line === 'PH').map((d) => d.position)

    const alone = build(13, 3.146, new Set(['AG']))
    const after = accessor<PreparedLine, [number, number, number][]>(alone.shared.props.getPath)(
      (alone.shared.props.data as PreparedLine[]).find((l) => l.id === 'PH')!,
    )
    expect(after).toEqual(before)
    expect(alone.dots.filter((dot) => dot.line === 'PH').map((d) => d.position)).toEqual(phBefore)
  })

  it('rebuilds only when the hidden set changes', () => {
    const hidden = new Set(['AG'])
    const a = build(14, 3.146, hidden)
    const b = build(14, 3.146, hidden)
    expect(b).toBe(a)
    expect(build(14, 3.146, new Set(['AG']))).not.toBe(a)
  })
})
