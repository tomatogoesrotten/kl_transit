import type { PreparedNetwork } from '../sim'
import type { StyleLayer } from './modes'

/**
 * Colouring the REAL buildings at each station, instead of drawing our own.
 *
 * Three attempts at generated station models were rejected on looks, and the
 * owner's answer was "make the building on the map itself show the colour". So
 * nothing here creates geometry: these are extra fill-extrusion layers on the
 * very same `building` source-layer the base map already draws, filtered down
 * to the buildings near a station and painted in that station's line colour.
 *
 * Two things this CANNOT do, and both are the data, not the code:
 *
 * 1. **Below zoom 13 there are no buildings at all.** The `building`
 *    source-layer starts at 13 and the style draws it from 14, so zoomed out
 *    there is nothing to colour. The per-line rings in `layers.ts` are what
 *    marks a station at every zoom, and they are why this is an addition
 *    rather than a replacement.
 * 2. **Nothing in the tiles says which building is a station.** The only
 *    fields are `colour`, `hide_3d`, `render_height` and `render_min_height`.
 *    So this is done by PROXIMITY and it is a guess: it will tint the shopping
 *    centre a station is built into, and it will miss a station whose entrance
 *    is a hole in the ground with no building over it. Honest about it rather
 *    than pretending otherwise.
 */

/**
 * How near a station's published coordinate a building has to be to count as
 * that station's, in metres. This is the whole judgement in this file.
 *
 * Deliberately small. `distance` measures to the building's OUTLINE and returns
 * zero when the point is inside it, so a station whose coordinate lands on its
 * own concourse is caught however small this is; the radius only matters when
 * the coordinate sits beside the building, which is the common case for a
 * street-level entrance. Thirty metres is about a KL road plus its five-foot
 * way — enough to cross to the building the entrance belongs to, and not enough
 * to reach the next block.
 *
 * Too large is the failure that reads worst: in the city centre a hundred
 * metres would light up six towers and say "the station is all of these". If
 * this needs tuning it is one number, and it is meant to be tuned by eye over
 * live tiles, which is the only way it can be.
 */
export const STATION_RADIUS_M = 30

/** The `building` layer we tint from, and take our geometry settings from. */
const BUILDING_SOURCE_LAYER = 'building'

/** The stations one line owns the colour of, as raw feed coordinates. */
export interface StationTint {
  lineId: string
  /** The line's colour, as the feed writes it: "#E57200". */
  color: string
  /** `[lon, lat]` per stop, straight from `network.json`. See `stationTints`. */
  points: [lon: number, lat: number][]
}

/**
 * A MapLibre layer definition, as loosely as we need one.
 *
 * Structural on purpose, so this file needs no MapLibre import and stays a unit
 * test — the same reason `modes.ts` describes a style layer for itself. MapView
 * widens the call once when it hands these to `addLayer`.
 */
export interface TintLayer {
  id: string
  type: 'fill-extrusion'
  source: string
  'source-layer': string
  minzoom?: number
  filter: unknown[]
  paint: Record<string, unknown>
}

/**
 * Every station, grouped by name, bucketed by the line that gives it its
 * colour.
 *
 * **These are the feed's RAW coordinates, and this is the one place in the
 * project that wants them.** Everywhere else a station is drawn at `pointAt` —
 * projected onto the track and shifted sideways where two lines share an
 * alignment — because a marker has to sit on the rails. A building does not:
 * the raw coordinate is where the feed says the station IS, which is what is
 * likely to be inside or against the station building. Up to about 105 m
 * separates the two, so using the drawn one here would tint whatever happens
 * to stand beside the viaduct.
 *
 * Grouped by name, exactly as the models were, because a place is one building
 * however many lines call there. A place with several lines takes the colour of
 * the FIRST one the feed lists: a building can only be one colour, this needs
 * no ranking of lines that nobody could defend, and the rings beside it still
 * show every line that calls. Interchanges are also why a name can only land in
 * one bucket — two layers tinting the same building would just fight over it.
 *
 * Lines are read through the timetable, never through `stops.route_id`, which
 * disagrees with `routes.txt` in this feed.
 */
export function stationTints(rail: PreparedNetwork): StationTint[] {
  /** Station name -> the line that colours it. First one in, wins. */
  const owner = new Map<string, string>()
  const byLine = new Map<string, [number, number][]>()
  const seen = new Set<string>()

  for (const line of rail.lines) {
    const forward = line.directions.find((d) => d.dir === 0)
    if (!forward) continue
    for (const stop of forward.stops) {
      // Direction 0 lists a stop once, but two lines can share a stop id, and
      // one building does not want tinting twice.
      if (seen.has(stop.id)) continue
      seen.add(stop.id)
      const station = rail.stations[stop.id]
      if (!station) continue
      const lineId = owner.get(station.name) ?? line.id
      owner.set(station.name, lineId)
      const points = byLine.get(lineId)
      // An interchange has one stop id per line, each with its own published
      // coordinate. All of them go in, because they are all somewhere on the
      // same station and more points mean a better chance of finding it.
      if (points) points.push([station.lon, station.lat])
      else byLine.set(lineId, [[station.lon, station.lat]])
    }
  }

  return rail.lines
    .filter((line) => byLine.has(line.id))
    .map((line) => ({ lineId: line.id, color: line.color, points: byLine.get(line.id)! }))
}

/**
 * The style's own extruded-buildings layer, whatever it is called.
 *
 * By type and source-layer, never by id, for the reason `modes.ts` gives:
 * liberty renames its layers between releases. What we want from it is the
 * height, the base and the zoom it starts at, so that a tinted building is
 * exactly the same shape as the grey one it replaces.
 */
export function buildingExtrusion(layers: readonly StyleLayer[]): StyleLayer | undefined {
  return layers.find(
    (layer) =>
      layer.type === 'fill-extrusion' && layer['source-layer'] === BUILDING_SOURCE_LAYER,
  )
}

/**
 * One fill-extrusion layer per line, tinting the buildings near its stations.
 *
 * `distance` and NOT `within`. `within` is the obvious expression for "is this
 * feature near these places" and it does not work here: checked against the
 * installed @maplibre/maplibre-gl-style-spec, `Within.evaluate` answers only
 * for Point and LineString features and returns FALSE for everything else.
 * Buildings are polygons, so a `within` filter would silently match nothing.
 * `distance` handles polygon features, and returns metres.
 *
 * One layer per line rather than one layer coloured by an expression, because
 * the colour is then a constant: MapLibre evaluates each layer's filter over
 * each building once, so a building is tested against all 187 stations either
 * way, but this way there are no per-feature paint arrays to build on top. The
 * work lands in the tile worker when a tile loads, not in the frame loop.
 *
 * The layers must be added AFTER the style's own building layer. Two extrusions
 * of the same building come out at the same depth, MapLibre draws 3D layers
 * with `LEQUAL`, and so the later one wins — which is the tint. They are also
 * opaque, so the grey underneath does not blend through and mud the colour.
 *
 * Returns nothing at all if the style has no extruded buildings: without one
 * there is nothing to copy the geometry from, and a guess at it would be a
 * layer that does not line up with the city.
 */
export function stationBuildingLayers(
  rail: PreparedNetwork,
  styleLayers: readonly StyleLayer[],
): TintLayer[] {
  const building = buildingExtrusion(styleLayers)
  if (!building) return []

  // Copied, not written out here, so a tinted building is the same solid as the
  // one the style drew. `fill-extrusion-base` is often absent, and an explicit
  // `undefined` is not the same as leaving a property out.
  const paint: Record<string, unknown> = {}
  for (const key of ['fill-extrusion-height', 'fill-extrusion-base']) {
    if (building.paint?.[key] !== undefined) paint[key] = building.paint[key]
  }

  return stationTints(rail).map((tint) => ({
    id: `station-buildings-${tint.lineId}`,
    type: 'fill-extrusion' as const,
    source: building.source ?? 'openmaptiles',
    'source-layer': BUILDING_SOURCE_LAYER,
    // The same zoom the style starts drawing buildings at, so tinted ones
    // appear with their neighbours rather than floating alone at zoom 13.
    minzoom: building.minzoom,
    filter: [
      '<',
      ['distance', { type: 'MultiPoint', coordinates: tint.points }],
      STATION_RADIUS_M,
    ],
    paint: { ...paint, 'fill-extrusion-color': tint.color, 'fill-extrusion-opacity': 1 },
  }))
}
