import { describe, expect, it } from 'vitest'
import { network, pointAt, prepare } from '../sim'
import { hexToRgb, labelLayerId, networkLayers, stationDots } from './layers'

const rail = prepare(network)
const layers = networkLayers(rail, 'test-label-layer')

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

describe('the line layer', () => {
  const lines = layers[0]

  it('draws every line in the network', () => {
    expect(lines.props.data).toHaveLength(network.lines.length)
  })

  it('takes every colour from the data, not from the app', () => {
    const getColor = accessor<(typeof rail.lines)[number], number[]>(lines.props.getColor)
    for (const line of rail.lines) {
      expect(getColor(line), line.id).toEqual(hexToRgb(line.color))
    }
    // If a palette were hardcoded the lines would not differ from each other.
    expect(new Set(rail.lines.map((l) => l.color)).size).toBeGreaterThan(1)
  })
})

describe('the station layer', () => {
  const stations = layers[1]

  it('draws every stop of every line, duplicates and all', () => {
    const total = rail.lines.reduce(
      (n, line) => n + (line.directions.find((d) => d.dir === 0)?.stops.length ?? 0),
      0,
    )
    expect(stations.props.data).toHaveLength(total)
    expect(total).toBe(stationDots(rail).length)
  })

  it('puts a station on the track, not at its published coordinate', () => {
    const dots = stationDots(rail)
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
