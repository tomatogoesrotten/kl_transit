import { SolidPolygonLayer } from '@deck.gl/layers'
import { pointAt } from '../sim'
import type { ActiveTrain, LonLat, Origin, Point, PreparedNetwork } from '../sim'
import { hexToRgb } from './layers'
import type { Interleaved, StationDot } from './layers'

type Rgb = [number, number, number]

/**
 * The height, in metres, that trains are drawn at.
 *
 * An assumption, and worth naming as one: the feed says nothing about which
 * stretches of line are elevated, at grade or in tunnel. Most of this network
 * runs on viaduct, so all of it is drawn on viaduct. Trains on the underground
 * sections therefore float above the city, and trains in the city centre are
 * still hidden behind tall buildings. Both are the price of composing with the
 * 3D buildings instead of painting over them. See design.md, "Height: an
 * assumption, declared as one".
 */
export const VIADUCT_M = 10

/**
 * The body colour, the same for every train — the roof carries the line.
 *
 * Taste, not contract: a mid slate, dark enough to read against the pale city
 * map and light enough to read against the wireframe's near-black ground.
 */
const BODY: Rgb = [110, 122, 138]

/** How far to the left of the centre line a train sits, as a multiple of `W`. */
const KEEP_LEFT = 1.15

/**
 * Half the width of a train, in metres, for the current camera.
 *
 * The trick, ported from the prototype: `W` is proportional to how much ground
 * one pixel covers, so anything measured as a multiple of `W` keeps a constant
 * size on screen however far away the camera is — the distance cancels. The
 * lower bound is what stops that: below it the train stops shrinking and
 * becomes a fixed real-world object, so zooming in makes it grow like a
 * building. The upper bound keeps it from swallowing the state when the camera
 * is out in space.
 *
 * `mpp` is the Mercator ground resolution and ignores the map's pitch, where
 * the prototype used the true eye-to-target distance. Close enough for sizing
 * something; do not reuse it for anything that has to be exact.
 */
export function halfWidth(zoom: number, lat: number): number {
  const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
  return Math.max(4, Math.min(420, 3.05 * mpp))
}

/**
 * The point `metres` to the LEFT of the direction of travel at `point`.
 *
 * Trains keep left in Malaysia. At compass bearing B the left-hand direction is
 * `(-cos B, +sin B)` in (east, north) components — the unit vector at B - 90.
 * Those metres become degrees through the network's own flat projection, never
 * haversine or turf: every distance in this app was built against that
 * projection, and mixing in a geodesic one would move them all.
 *
 * The latitude sign is `+`. `pointAt` writes `lat - z / ky` because its `z`
 * runs south; this offset is already a northward component, so it adds.
 *
 * Nothing but a test can catch this being backwards. Getting it wrong moves
 * both directions symmetrically, so the picture still looks perfectly
 * reasonable — it is just a picture of a country that drives on the right.
 */
export function keepLeft(point: Point, origin: Origin, metres: number): LonLat {
  const b = (point.bearingDeg * Math.PI) / 180
  return [
    point.lon + (-Math.cos(b) * metres) / origin.kx,
    point.lat + (Math.sin(b) * metres) / origin.ky,
  ]
}

/**
 * The four ground corners of a box centred on `centre`, pointing along
 * `bearingDeg`, `2 * halfWide` across and `2 * halfLong` from nose to tail,
 * with its base at `z` metres.
 *
 * The corners run from the nose's right-hand side round to the tail's; the ring
 * is left open and wound either way, because `SolidPolygonLayer` closes it and
 * fixes the winding itself.
 */
export function footprint(
  centre: LonLat,
  bearingDeg: number,
  halfWide: number,
  halfLong: number,
  origin: Origin,
  z: number,
): [number, number, number][] {
  const b = (bearingDeg * Math.PI) / 180
  // Forward is the unit vector at the bearing, in (east, north) components.
  const fLon = (Math.sin(b) * halfLong) / origin.kx
  const fLat = (Math.cos(b) * halfLong) / origin.ky
  // Left is that vector turned a quarter turn anticlockwise — the same normal
  // the keep-left offset uses, so the box sits square on its own centre.
  const lLon = (-Math.cos(b) * halfWide) / origin.kx
  const lLat = (Math.sin(b) * halfWide) / origin.ky
  const [lon, lat] = centre
  return [
    [lon + fLon - lLon, lat + fLat - lLat, z],
    [lon + fLon + lLon, lat + fLat + lLat, z],
    [lon - fLon + lLon, lat - fLat + lLat, z],
    [lon - fLon - lLon, lat - fLat - lLat, z],
  ]
}

/** One line colour per line id, parsed once. `hexToRgb` does a parseInt. */
export function lineColors(rail: PreparedNetwork): Map<string, Rgb> {
  return new Map(rail.lines.map((line) => [line.id, hexToRgb(line.color)]))
}

export interface TrainShape {
  /** The body's footprint: 2W across, 10W long. */
  body: [number, number, number][]
  /** The roof's: 1.6W across, 9.4W long, sitting on the body's top. */
  roof: [number, number, number][]
  color: Rgb
}

/**
 * Where every running train's box goes this frame.
 *
 * At the `W = 4` floor the body is 8 m across, 6.8 m tall and 40 m long, which
 * is a plausible two- or three-car set. The proportions come from the
 * prototype; the numbers are a starting point, not a contract.
 */
export function trainShapes(
  trains: readonly ActiveTrain[],
  W: number,
  colors: ReadonlyMap<string, Rgb>,
): TrainShape[] {
  const shapes: TrainShape[] = []
  for (const train of trains) {
    // Once per train: this call gives both the position and the bearing the
    // keep-left offset and the box orientation are built from.
    const p = pointAt(train.line, train.at, train.dir.reversed)
    const centre = keepLeft(p, train.line.origin, W * KEEP_LEFT)
    const roofBase = VIADUCT_M + W * 1.7
    shapes.push({
      body: footprint(centre, p.bearingDeg, W, W * 5, train.line.origin, VIADUCT_M),
      roof: footprint(centre, p.bearingDeg, W * 0.8, W * 4.7, train.line.origin, roofBase),
      color: colors.get(train.line.id) ?? BODY,
    })
  }
  return shapes
}

/**
 * The two layers a train is made of: a neutral body and a line-coloured roof.
 *
 * Two `SolidPolygonLayer`s rather than one, because a solid polygon carries one
 * colour, and rather than a mesh, because `@deck.gl/mesh-layers` is not
 * installed. `SolidPolygonLayer` and not `PolygonLayer`: the latter is a
 * composite that also builds a stroke layer nothing here wants.
 *
 * Rebuilt every frame on purpose. deck.gl layers are immutable descriptors, not
 * GPU state, so a fresh `data` array regenerates the attributes on its own and
 * needs no `updateTriggers`.
 */
export function trainLayers(shapes: TrainShape[], W: number, beforeId: string) {
  return [
    new SolidPolygonLayer<TrainShape, Interleaved>({
      id: 'train-bodies',
      data: shapes,
      beforeId,
      extruded: true,
      // The polygon's own z is the base; `getElevation` is the height above it.
      getPolygon: (d) => d.body,
      getElevation: W * 1.7,
      getFillColor: BODY,
    }),
    new SolidPolygonLayer<TrainShape, Interleaved>({
      id: 'train-roofs',
      data: shapes,
      beforeId,
      extruded: true,
      getPolygon: (d) => d.roof,
      getElevation: W * 0.4,
      getFillColor: (d) => d.color,
    }),
  ]
}

/**
 * Stop id to the index of its marker in `stationDots`.
 *
 * By id, never by index: `train.stop` counts along its own direction's stop
 * list, and direction 1's list is direction 0's reversed — and direction 0's is
 * what the markers were built from. All 187 stop ids are unique across the
 * network, so an id is an unambiguous answer where an index is a mirrored one.
 */
export function stationIndex(dots: readonly StationDot[]): Map<string, number> {
  return new Map(dots.map((dot, i) => [dot.id, i]))
}

/**
 * The markers with a train standing at them.
 *
 * The `dwelling` guard is not optional. `Progress.stop` is the stop a train is
 * at *or the one it is heading for*, so without it every station on the network
 * lights up and stays lit.
 */
export function busyStations(
  trains: readonly ActiveTrain[],
  index: ReadonlyMap<string, number>,
): Set<number> {
  const busy = new Set<number>()
  for (const train of trains) {
    if (!train.dwelling) continue
    const i = index.get(train.dir.stops[train.stop].id)
    if (i !== undefined) busy.add(i)
  }
  return busy
}
