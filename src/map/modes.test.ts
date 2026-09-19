import { describe, expect, it } from 'vitest'
import { layerVisibility } from './modes'

// Abridged from the liberty style, one of each of its six layer types: the
// ground, the hillshade raster, land use, water, roads, the 3D buildings and the
// labels, plus one layer the style ships switched off (liberty ships none, but a
// round trip must not switch one on).
const liberty = [
  { id: 'background', type: 'background' },
  { id: 'natural_earth', type: 'raster' },
  { id: 'landuse_residential', type: 'fill' },
  { id: 'water', type: 'fill' },
  { id: 'road_motorway', type: 'line' },
  { id: 'building-3d', type: 'fill-extrusion' },
  { id: 'label_city', type: 'symbol' },
  { id: 'poi_z16', type: 'symbol', layout: { visibility: 'none' } },
]

function visibilityOf(mode: 'city' | 'skeleton', id: string) {
  return layerVisibility(liberty, mode).find((l) => l.id === id)?.visibility
}

describe('layerVisibility', () => {
  it('leaves the city alone in city mode', () => {
    expect(visibilityOf('city', 'water')).toBe('visible')
    expect(visibilityOf('city', 'building-3d')).toBe('visible')
    expect(visibilityOf('city', 'label_city')).toBe('visible')
  })

  it('keeps a layer the style ships hidden hidden', () => {
    expect(visibilityOf('city', 'poi_z16')).toBe('none')
  })

  it('hides every layer but the ground in skeleton mode', () => {
    const hidden = layerVisibility(liberty, 'skeleton').filter((l) => l.visibility === 'none')
    const everythingElse = liberty.filter((l) => l.id !== 'background')
    expect(hidden.map((l) => l.id)).toEqual(everythingElse.map((l) => l.id))
  })

  it('never hides the background: it is the ground in skeleton mode', () => {
    expect(visibilityOf('skeleton', 'background')).toBe('visible')
    expect(visibilityOf('city', 'background')).toBe('visible')
  })

  it('has something to say about every layer, in the order the style gave them', () => {
    expect(layerVisibility(liberty, 'skeleton').map((l) => l.id)).toEqual(liberty.map((l) => l.id))
  })
})
