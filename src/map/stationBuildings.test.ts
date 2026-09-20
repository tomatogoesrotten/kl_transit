import { describe, expect, it } from 'vitest'
import { network, prepare } from '../sim'
import { stationDots } from './layers'
import { sharedCorridors } from './offset'
import type { StyleLayer } from './modes'
import {
  STATION_RADIUS_M,
  buildingExtrusion,
  stationBuildingLayers,
  stationTints,
} from './stationBuildings'

const rail = prepare(network)
const tints = stationTints(rail)

/** Abridged from liberty: the buildings layer, plus a couple to not pick. */
const liberty: StyleLayer[] = [
  { id: 'background', type: 'background' },
  { id: 'water', type: 'fill', 'source-layer': 'water' },
  { id: 'building', type: 'fill', source: 'openmaptiles', 'source-layer': 'building' },
  {
    id: 'building-3d',
    type: 'fill-extrusion',
    source: 'openmaptiles',
    'source-layer': 'building',
    minzoom: 14,
    paint: {
      'fill-extrusion-color': 'hsl(35,8%,85%)',
      'fill-extrusion-height': ['get', 'render_height'],
      'fill-extrusion-opacity': 0.8,
    },
  },
  { id: 'label_city', type: 'symbol', 'source-layer': 'place' },
]

/** Metres apart, in the network's own flat projection — as everything else here measures. */
function metresApart(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[0] - b[0]) * rail.origin.kx, (a[1] - b[1]) * rail.origin.ky)
}

describe('which line colours which station', () => {
  it('places every stop the feed has, exactly once', () => {
    const points = tints.reduce((n, t) => n + t.points.length, 0)
    expect(points).toBe(Object.keys(rail.stations).length)
    expect(points).toBe(187)
  })

  it('gives each line its own colour, straight from the feed', () => {
    for (const tint of tints) {
      const line = rail.lines.find((l) => l.id === tint.lineId)!
      expect(tint.color).toBe(line.color)
      expect(tint.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('keeps a whole place in one bucket, so two layers never fight over one building', () => {
    // A building can only be one colour. Titiwangsa is four lines and all four
    // of its platforms have to end up under the same one.
    const owner = new Map<string, string>()
    for (const tint of tints) {
      for (const [lon, lat] of tint.points) {
        const station = Object.values(rail.stations).find((s) => s.lon === lon && s.lat === lat)!
        const already = owner.get(station.name)
        if (already) expect(already).toBe(tint.lineId)
        owner.set(station.name, tint.lineId)
      }
    }
    expect(owner.size).toBe(160)
  })

  it('colours an interchange with one of the lines that actually calls there', () => {
    // The first the feed lists, which for Titiwangsa is Ampang. The rings
    // beside it still show all four.
    const ampang = tints.find((t) => t.lineId === 'AG')!
    const titiwangsa = Object.entries(rail.stations).filter(([, s]) => s.name === 'Titiwangsa')
    expect(titiwangsa.length).toBe(4)
    for (const [, station] of titiwangsa) {
      expect(ampang.points).toContainEqual([station.lon, station.lat])
    }
  })
})

describe('the coordinates a building is matched against', () => {
  it('are the feed’s RAW ones, not the positions the station is drawn at', () => {
    // The drawn position is projected onto the track and shifted sideways for a
    // shared corridor, so it sits on the rails — up to 105 m from where the
    // feed says the station is. A building wants the latter.
    const dots = stationDots(rail, sharedCorridors(rail), 40)
    let worst = 0
    for (const dot of dots) {
      const station = rail.stations[dot.id]
      worst = Math.max(worst, metresApart(dot.position, [station.lon, station.lat]))
    }
    expect(worst).toBeGreaterThan(50)

    const raw = tints.flatMap((t) => t.points)
    for (const station of Object.values(rail.stations)) {
      expect(raw).toContainEqual([station.lon, station.lat])
    }
  })
})

describe('the tint layers', () => {
  const layers = stationBuildingLayers(rail, liberty)

  it('draws one layer per line, with a distinct id', () => {
    expect(layers).toHaveLength(tints.length)
    expect(new Set(layers.map((l) => l.id)).size).toBe(layers.length)
    expect(layers.map((l) => l.id)).toContain('station-buildings-AG')
  })

  it('sits on the style’s own buildings, at the zoom the style draws them from', () => {
    for (const layer of layers) {
      expect(layer.type).toBe('fill-extrusion')
      expect(layer.source).toBe('openmaptiles')
      expect(layer['source-layer']).toBe('building')
      expect(layer.minzoom).toBe(14)
      // Copied, so a tinted building is the same solid as the grey one under it.
      expect(layer.paint['fill-extrusion-height']).toEqual(['get', 'render_height'])
    }
  })

  it('is opaque and in its own line’s colour', () => {
    for (const layer of layers) {
      const line = rail.lines.find((l) => l.id === layer.id.replace('station-buildings-', ''))!
      expect(layer.paint['fill-extrusion-color']).toBe(line.color)
      // Not the style's 0.8: the grey underneath would blend through and mud it.
      expect(layer.paint['fill-extrusion-opacity']).toBe(1)
    }
  })

  it('filters by distance to that line’s stations, in metres', () => {
    // `distance` and not `within`: `within` answers only for Point and
    // LineString features and returns false for a polygon, so a `within` filter
    // on buildings would silently match nothing at all.
    for (const layer of layers) {
      const [op, measure, radius] = layer.filter as [string, unknown[], number]
      expect(op).toBe('<')
      expect(measure[0]).toBe('distance')
      expect(measure[1]).toEqual({
        type: 'MultiPoint',
        coordinates: tints.find((t) => layer.id.endsWith(t.lineId))!.points,
      })
      expect(radius).toBe(STATION_RADIUS_M)
    }
  })

  it('keeps the radius small enough to mean one building, not one block', () => {
    // The whole judgement in that file, and the failure that reads worst is a
    // radius that lights up the six towers around a city-centre station.
    expect(STATION_RADIUS_M).toBeGreaterThan(0)
    expect(STATION_RADIUS_M).toBeLessThanOrEqual(60)
  })

  it('draws nothing at all when the style has no extruded buildings', () => {
    // Rather than guessing at a height and standing a coloured block somewhere
    // the city has none.
    expect(stationBuildingLayers(rail, [{ id: 'background', type: 'background' }])).toEqual([])
  })
})

describe('finding the style’s buildings', () => {
  it('goes by type and source-layer, never by id', () => {
    expect(buildingExtrusion(liberty)?.id).toBe('building-3d')
    // A renamed layer is still found; a flat fill on the same source is not.
    const renamed = liberty.map((l) => ({ ...l, id: `${l.id}-2026` }))
    expect(buildingExtrusion(renamed)?.id).toBe('building-3d-2026')
    expect(buildingExtrusion(liberty.filter((l) => l.type !== 'fill-extrusion'))).toBeUndefined()
  })
})
