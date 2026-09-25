import { describe, expect, it } from 'vitest'
import { BASE_BUS_STOPS, layerOps, stationNameFilters, WIREFRAME } from './modes'
import type { MapMode, StyleLayer } from './modes'

// Abridged from liberty: one layer of each category the rules name, plus two
// they do not (a `circle` layer and a fill on an unknown source-layer) to prove
// unmatched layers are left alone, and one the style ships switched off.
const liberty: StyleLayer[] = [
  { id: 'background', type: 'background', paint: { 'background-color': '#f8f4f0' } },
  { id: 'natural_earth', type: 'raster', paint: { 'raster-opacity': 0.6 } },
  { id: 'landuse_residential', type: 'fill', 'source-layer': 'landuse' },
  { id: 'park', type: 'fill', 'source-layer': 'park' },
  { id: 'water', type: 'fill', 'source-layer': 'water', paint: { 'fill-color': 'rgb(158,189,255)' } },
  { id: 'waterway_river', type: 'line', 'source-layer': 'waterway', paint: { 'line-color': '#a0c8f0' } },
  {
    id: 'highway_motorway',
    type: 'line',
    'source-layer': 'transportation',
    paint: { 'line-color': '#e9ac77', 'line-width': 3 },
  },
  { id: 'boundary_country', type: 'line', 'source-layer': 'boundary' },
  { id: 'building', type: 'fill', 'source-layer': 'building' },
  {
    id: 'building-3d',
    type: 'fill-extrusion',
    'source-layer': 'building',
    paint: { 'fill-extrusion-color': 'hsl(35,8%,85%)', 'fill-extrusion-opacity': 0.8 },
  },
  { id: 'label_city', type: 'symbol', 'source-layer': 'place' },
  { id: 'poi_z16', type: 'symbol', 'source-layer': 'poi', layout: { visibility: 'none' } },
  { id: 'some_new_dots', type: 'circle', 'source-layer': 'poi' },
  { id: 'some_new_fill', type: 'fill', 'source-layer': 'mystery' },
]

function opFor(mode: MapMode, id: string) {
  const op = layerOps(liberty, mode).find((l) => l.id === id)
  if (!op) throw new Error(`no op for ${id}`)
  return op
}

describe('layerOps', () => {
  it('has something to say about every layer, in the order the style gave them', () => {
    expect(layerOps(liberty, 'wireframe').map((l) => l.id)).toEqual(liberty.map((l) => l.id))
  })

  it('leaves the city alone in city mode', () => {
    for (const id of ['water', 'building-3d', 'label_city', 'park']) {
      expect(opFor('city', id).visibility).toBe('visible')
    }
  })

  it('keeps a layer the style ships hidden hidden', () => {
    expect(opFor('city', 'poi_z16').visibility).toBe('none')
    expect(opFor('wireframe', 'poi_z16').visibility).toBe('none')
  })

  it('hides every symbol layer in the wireframe: place names and POI icons', () => {
    expect(opFor('wireframe', 'label_city').visibility).toBe('none')
    expect(opFor('wireframe', 'poi_z16').visibility).toBe('none')
  })

  it('hides the hillshade, the land fills and the flat building fills', () => {
    for (const id of ['natural_earth', 'landuse_residential', 'park', 'building']) {
      expect(opFor('wireframe', id).visibility).toBe('none')
    }
  })

  it('recolours the street grid rather than hiding it', () => {
    const street = opFor('wireframe', 'highway_motorway')
    expect(street.visibility).toBe('visible')
    expect(street.paint).toEqual({
      'line-color': WIREFRAME.street,
      'line-width': WIREFRAME.streetWidth,
    })
  })

  it('draws water dimmer than the streets', () => {
    expect(opFor('wireframe', 'water').paint['fill-color']).toBe(WIREFRAME.water)
    expect(opFor('wireframe', 'waterway_river').paint['line-color']).toBe(WIREFRAME.water)
    expect(WIREFRAME.water).not.toBe(WIREFRAME.street)
  })

  it('makes the extruded buildings translucent volumes', () => {
    expect(opFor('wireframe', 'building-3d')).toMatchObject({
      visibility: 'visible',
      paint: {
        'fill-extrusion-color': WIREFRAME.building,
        'fill-extrusion-opacity': WIREFRAME.buildingOpacity,
      },
    })
  })

  it('never hides the background: it is the ground in both modes', () => {
    expect(opFor('wireframe', 'background').visibility).toBe('visible')
    expect(opFor('city', 'background').visibility).toBe('visible')
    expect(opFor('wireframe', 'background').paint['background-color']).toBe(WIREFRAME.ground)
  })

  it('leaves an unmatched layer completely alone', () => {
    for (const mode of ['city', 'wireframe'] as const) {
      for (const id of ['some_new_dots', 'some_new_fill']) {
        expect(opFor(mode, id)).toEqual({ id, visibility: 'visible', paint: {} })
      }
    }
  })

  it('restores each layer to the paint the style shipped, from the snapshot', () => {
    expect(opFor('city', 'background').paint).toEqual({ 'background-color': '#f8f4f0' })
    expect(opFor('city', 'water').paint).toEqual({ 'fill-color': 'rgb(158,189,255)' })
    expect(opFor('city', 'highway_motorway').paint).toEqual({
      'line-color': '#e9ac77',
      'line-width': 3,
    })
    expect(opFor('city', 'building-3d').paint).toEqual({
      'fill-extrusion-color': 'hsl(35,8%,85%)',
      'fill-extrusion-opacity': 0.8,
    })
  })

  it('clears a property the style never set, rather than leaving ours behind', () => {
    // `waterway_river` ships no line-width, so returning to the city must unset
    // the one the wireframe wrote and let MapLibre's own default stand again.
    const restored = opFor('city', 'waterway_river').paint
    expect(Object.keys(restored)).toContain('line-width')
    expect(restored['line-width']).toBeUndefined()
  })

  it('resets exactly the properties the wireframe sets, and no others', () => {
    for (const layer of liberty) {
      expect(Object.keys(opFor('city', layer.id).paint).sort()).toEqual(
        Object.keys(opFor('wireframe', layer.id).paint).sort(),
      )
    }
  })
})

describe('layerOps in the bus view', () => {
  const withStops: StyleLayer[] = [
    ...liberty,
    { id: BASE_BUS_STOPS, type: 'symbol', 'source-layer': 'poi', paint: { 'text-color': '#666' } },
  ]
  const op = (mode: MapMode, view: 'rail' | 'bus', id: string) =>
    layerOps(withStops, mode, view).find((l) => l.id === id)!

  it("hides the base map's own bus stops in the bus view, in both map styles", () => {
    expect(op('city', 'bus', BASE_BUS_STOPS).visibility).toBe('none')
    expect(op('wireframe', 'bus', BASE_BUS_STOPS).visibility).toBe('none')
  })

  it('shows them again in the rail view exactly as before', () => {
    expect(op('city', 'rail', BASE_BUS_STOPS)).toEqual(layerOps(withStops, 'city')[withStops.length - 1])
    expect(op('city', 'rail', BASE_BUS_STOPS).visibility).toBe('visible')
  })

  it('changes nothing else: every other op is the rail view one', () => {
    for (const mode of ['city', 'wireframe'] as const) {
      const bus = layerOps(withStops, mode, 'bus').filter((l) => l.id !== BASE_BUS_STOPS)
      const rail = layerOps(withStops, mode, 'rail').filter((l) => l.id !== BASE_BUS_STOPS)
      expect(bus).toEqual(rail)
    }
  })
})

describe('stationNameFilters', () => {
  const rank = ['>=', ['get', 'rank'], 1]
  const transit = ['match', ['get', 'class'], ['airport', 'bus', 'rail'], true, false]
  const layers: StyleLayer[] = [
    { id: 'poi_r1', type: 'symbol', 'source-layer': 'poi', filter: rank },
    { id: 'poi_transit', type: 'symbol', 'source-layer': 'poi', filter: transit },
    { id: 'poi_bare', type: 'symbol', 'source-layer': 'poi' },
    { id: 'label_city', type: 'symbol', 'source-layer': 'place', filter: rank },
    { id: 'poi_fill', type: 'fill', 'source-layer': 'poi' },
  ]
  const notRailway = ['!=', ['get', 'class'], 'railway']

  it('adds the railway exclusion to every POI symbol layer, keeping its own filter', () => {
    expect(stationNameFilters(layers)).toEqual([
      { id: 'poi_r1', filter: ['all', rank, notRailway] },
      // Bus stops keep drawing: their filter still admits `bus`.
      { id: 'poi_transit', filter: ['all', transit, notRailway] },
      { id: 'poi_bare', filter: notRailway },
    ])
  })

  it('is never undone by a mode or view switch, because no op carries a filter', () => {
    for (const mode of ['city', 'wireframe'] as MapMode[]) {
      for (const view of ['rail', 'bus'] as const) {
        for (const op of layerOps(layers, mode, view)) {
          expect(Object.keys(op).sort()).toEqual(['id', 'paint', 'visibility'])
        }
      }
    }
  })
})
