export type MapMode = 'city' | 'wireframe'

/**
 * The blueprint palette.
 *
 * Taste, not contract: these are a starting point to be tuned by eye. The intent
 * is an order of brightness — dark ground, dim streets, dimmer water, ghostly
 * building volumes, lit footprints — with the network's own line colours, which
 * nothing here touches, sitting brightest of all on top.
 */
export const WIREFRAME = {
  /** The ground. Near-black, with just enough blue to read as ink rather than off. */
  ground: '#060a12',
  /** The street grid. Present as structure, not as a thing you read. */
  street: '#2a5a8c',
  streetWidth: 0.7,
  /** Water, a step darker than the streets so rivers do not look like roads. */
  water: '#12304d',
  waterWidth: 1,
  /** Extruded buildings: translucent volumes, not solids. */
  building: '#1a3a5c',
  buildingOpacity: 0.35,
  /** The footprint line we add ourselves — the lit base under each volume. */
  footprint: '#4d9de0',
  footprintWidth: 0.8,
} as const

/** The id of the wireframe footprint layer this app adds to the base map. See `MapView`. */
export const FOOTPRINT_LAYER = 'wireframe-building-footprints'

/**
 * A style layer, as loosely as we can describe one and still decide about it.
 * Kept structural so `modes.ts` needs no MapLibre import and stays unit-testable.
 */
export interface StyleLayer {
  id: string
  type: string
  source?: string
  'source-layer'?: string
  minzoom?: number
  // `unknown`, not `'visible' | 'none'`: MapLibre lets visibility be an
  // expression too, and we only ever ask whether it is the literal 'none'.
  layout?: { visibility?: unknown }
  paint?: Record<string, unknown>
}

export interface LayerOp {
  id: string
  visibility: 'visible' | 'none'
  /**
   * Paint properties to write. A value of `undefined` clears ours and lets the
   * style's own default stand again — which is how city mode restores a layer
   * that carried no explicit value of its own.
   */
  paint: Record<string, unknown>
}

/** Colour that competes with the network, so the wireframe drops it. */
const HIDDEN_FILLS = new Set(['landcover', 'landuse', 'park', 'aeroway', 'transportation', 'building'])
const HIDDEN_LINES = new Set(['park', 'boundary', 'aeroway'])

/**
 * What the wireframe does to one layer: hide it, repaint it, or nothing.
 *
 * Keyed on `type` and `source-layer`, never on layer id. Liberty ships 111
 * layers and renames them between releases; a rule per category survives that,
 * a rule per id does not.
 *
 * `null` means leave the layer exactly as the style drew it. That is deliberate
 * for anything unmatched: a stray coloured layer is visible and easy to
 * diagnose, a silently missing one is neither.
 */
function wireframeRule(layer: StyleLayer): Record<string, unknown> | 'hide' | null {
  const source = layer['source-layer']
  switch (layer.type) {
    case 'background':
      return { 'background-color': WIREFRAME.ground }
    // Place names and POI icons, and the shaded-relief hillshade under everything.
    case 'symbol':
    case 'raster':
      return 'hide'
    case 'fill-extrusion':
      return source === 'building'
        ? {
            'fill-extrusion-color': WIREFRAME.building,
            'fill-extrusion-opacity': WIREFRAME.buildingOpacity,
          }
        : null
    case 'fill':
      if (source === 'water') return { 'fill-color': WIREFRAME.water }
      // Flat building fills go: the footprint line layer we add replaces them.
      return source && HIDDEN_FILLS.has(source) ? 'hide' : null
    case 'line':
      if (source === 'transportation') {
        return { 'line-color': WIREFRAME.street, 'line-width': WIREFRAME.streetWidth }
      }
      if (source === 'waterway') {
        return { 'line-color': WIREFRAME.water, 'line-width': WIREFRAME.waterWidth }
      }
      return source && HIDDEN_LINES.has(source) ? 'hide' : null
    default:
      return null
  }
}

/**
 * What to do to every style layer for a given mode.
 *
 * Pass the layers captured when the style loaded, not the live ones. The live
 * list contains deck.gl's own network layers, and carries whatever this function
 * last wrote; the snapshot still holds each layer's original paint, which is
 * exactly what city mode writes back.
 *
 * City mode resets only the properties the wireframe would have set, so a
 * round trip is a true round trip and nothing is hardcoded.
 *
 * The layers this app adds itself are not in that snapshot, so nothing here
 * ever touches them, and each one is decided on where it is added in `MapView`:
 * the wireframe footprints are switched on and off by hand, and the tinted
 * station buildings are left lit in both modes on purpose — see
 * `stationBuildings.ts`.
 */
export function layerOps(layers: readonly StyleLayer[], mode: MapMode): LayerOp[] {
  return layers.map((layer) => {
    // `visible` unless the style itself shipped the layer switched off.
    const original = layer.layout?.visibility === 'none' ? 'none' : 'visible'
    const rule = wireframeRule(layer)

    if (rule === null) return { id: layer.id, visibility: original, paint: {} }
    if (rule === 'hide') {
      return {
        id: layer.id,
        visibility: mode === 'wireframe' ? 'none' : original,
        paint: {},
      }
    }

    const paint =
      mode === 'wireframe'
        ? rule
        : Object.fromEntries(Object.keys(rule).map((key) => [key, layer.paint?.[key]]))
    return { id: layer.id, visibility: original, paint }
  })
}
