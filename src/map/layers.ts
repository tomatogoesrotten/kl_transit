import { PathLayer, ScatterplotLayer } from '@deck.gl/layers'
import { pointAt } from '../sim'
import type { PreparedLine, PreparedNetwork } from '../sim'
import { gapMetres, keepLeft, offsetAt, offsetPath } from './offset'
import type { Corridors } from './offset'

// deck.gl accepts a `beforeId` naming the MapLibre layer to draw beneath, but
// @deck.gl/maplibre does not add it to the public layer prop types, so we say so.
export type Interleaved = { beforeId: string }

/**
 * The style layer to draw the network beneath: above the base map and its
 * buildings, below the labels.
 *
 * Read from the live style rather than hardcoded, because OpenFreeMap can rename
 * its layers and deck.gl silently appends on top when a `beforeId` is missing.
 */
export function labelLayerId(layers: readonly { id: string; type: string }[]): string | undefined {
  const buildings = layers.reduce((n, l, i) => (l.type === 'fill-extrusion' ? i : n), -1)
  return layers.find((l, i) => i > buildings && l.type === 'symbol')?.id
}

/** "#E57200" -> [229, 114, 0]. deck.gl wants channels, the feed gives hex. */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Metres of height between one line and the next.
 *
 * Two pieces of geometry at the same height contend for the depth buffer and
 * flicker, or tear into stripes, wherever they touch. Half a metre is enough to
 * settle which is in front and small enough to be invisible: at the map's 55
 * degrees of pitch the whole eight-line stack leans sideways by about five
 * metres, well under a pixel except when the camera is right down in a street.
 *
 * It is a backstop, not the fix: lines sharing an alignment are separated
 * sideways by `offset.ts`. This is what a shared stretch nobody anticipated
 * degrades to — one line in front of the other, rather than barber's pole.
 */
const LINE_Z_STEP = 0.5

/** How high `line` is drawn, in metres. By its position in the feed, so every line differs. */
function elevationOf(rail: PreparedNetwork, line: PreparedLine): number {
  return rail.lines.indexOf(line) * LINE_Z_STEP
}

export interface StationDot {
  id: string
  /** The line this marker belongs to, so a pick knows which timetable to read. */
  line: string
  position: [lon: number, lat: number, z: number]
  color: [number, number, number]
  /**
   * True while a train is standing at this platform. Mutated in place by the
   * frame loop, which is why the layer below carries an `updateTriggers`.
   */
  busy: boolean
}

/**
 * The fill of a station nobody is standing at: invisible, not a background
 * colour. The prototype could fill with the page background because it drew on
 * a flat shader ground; here there is a real map underneath and an opaque fill
 * would punch a hole in the city.
 */
const IDLE: [number, number, number, number] = [0, 0, 0, 0]

/** Nothing hidden. One shared instance, so the "did it change" test stays an identity test. */
const EMPTY: ReadonlySet<string> = new Set<string>()

/**
 * One dot per stop per line, placed on the track.
 *
 * Not at `stations[id].lon/lat`: the feed's coordinates sit up to 105 m from the
 * rails, so raw they float beside their own line. `stop.at` is a distance along
 * the stored path, and the path is stored in direction 0's sense, so direction 0
 * reads it unreversed. Direction 1 unreversed would mirror every station.
 *
 * `gap` is the separation between lines sharing an alignment, in metres for the
 * camera in hand. It is passed in rather than read here for the same reason the
 * path takes it: a marker has to move with its own line or it floats beside a
 * track nobody drew.
 *
 * Stations shared by two lines appear once per line. That is the feed being
 * honest about per-line stop ids; merging them is later work.
 *
 * `hidden` drops whole lines from the data. It never touches `corridors`: those
 * are computed once from the whole network, and recomputing them from the
 * visible subset would move a line 8.5 km sideways because its neighbour was
 * switched off.
 */
export function stationDots(
  rail: PreparedNetwork,
  corridors: Corridors,
  gap: number,
  hidden: ReadonlySet<string> = EMPTY,
): StationDot[] {
  const dots: StationDot[] = []
  for (const line of rail.lines) {
    if (hidden.has(line.id)) continue
    const color = hexToRgb(line.color)
    const z = elevationOf(rail, line)
    const forward = line.directions.find((d) => d.dir === 0)
    if (!forward) continue
    for (const stop of forward.stops) {
      const p = pointAt(line, stop.at, false)
      const slot = offsetAt(corridors, line.id, stop.at)
      const [lon, lat] = slot === 0 ? [p.lon, p.lat] : keepLeft(p, line.origin, slot * gap)
      dots.push({
        id: stop.id,
        line: line.id,
        position: [lon, lat, z],
        color,
        busy: false,
      })
    }
  }
  return dots
}

/**
 * One path per line, for some subset of the lines.
 *
 * `updateTriggers` on `getPath` because the accessor closes over `gap`, which
 * changes with the zoom: without it deck.gl would see the same `data` array and
 * keep the geometry it already tessellated.
 *
 * NOT pickable, and deliberately so: a track is large and it is everywhere near
 * a line, so if it answered a pick it would answer instead of the train
 * standing on it. deck.gl's default is already unpickable — this note is here
 * so that nobody switches it on for symmetry with the other layers.
 */
function trackLayer(
  id: string,
  lines: PreparedLine[],
  rail: PreparedNetwork,
  corridors: Corridors,
  gap: number,
  beforeId: string,
) {
  return new PathLayer<PreparedLine, Interleaved>({
    id,
    data: lines,
    beforeId,
    getPath: (line) => offsetPath(line, corridors, gap, elevationOf(rail, line)),
    getColor: (line) => hexToRgb(line.color),
    // Pixels, not metres: a real track is about three metres wide, which at
    // city-wide zoom is less than one pixel and vanishes. A constant pixel
    // width needs no min or max — it is already the same at every zoom.
    widthUnits: 'pixels',
    getWidth: 4,
    capRounded: true,
    jointRounded: true,
    updateTriggers: { getPath: gap },
  })
}

/**
 * The lines that share track with nobody: drawn on their own geometry.
 *
 * Built once and handed back unchanged forever. They are in a layer of their
 * own so that moving the offset lines — which happens on every zoom change —
 * does not re-tessellate thousands of vertices that did not move.
 */
export function lineLayer(
  rail: PreparedNetwork,
  corridors: Corridors,
  beforeId: string,
  hidden: ReadonlySet<string> = EMPTY,
) {
  const plain = rail.lines.filter((line) => !corridors.has(line.id) && !hidden.has(line.id))
  return trackLayer('lines', plain, rail, corridors, 0, beforeId)
}

/** The lines that share track, drawn beside it. Rebuilt when the zoom changes. */
export function sharedLineLayer(
  rail: PreparedNetwork,
  corridors: Corridors,
  gap: number,
  beforeId: string,
  hidden: ReadonlySet<string> = EMPTY,
) {
  const shared = rail.lines.filter((line) => corridors.has(line.id) && !hidden.has(line.id))
  return trackLayer('shared-lines', shared, rail, corridors, gap, beforeId)
}

/**
 * One dot over every stop, filled while a train stands at it.
 *
 * `filled` is a layer-level property, so it cannot be turned on for one marker.
 * The fill is therefore always drawn and made transparent when idle.
 *
 * `dots` is a single array mutated in place, which deck.gl cannot see into.
 * `busyVersion` is how it is told: bump it when the busy set changes, and leave
 * it alone when it has not.
 *
 * Pickable, so a station can be inspected. A train standing at the platform
 * still wins the pick, because trains are drawn at `VIADUCT_M` and these
 * markers at a fraction of a metre — the elevation is load-bearing, not
 * decorative. See the note on `VIADUCT_M` in trains.ts.
 */
export function stationLayer(dots: StationDot[], beforeId: string, busyVersion: number) {
  return new ScatterplotLayer<StationDot, Interleaved>({
    id: 'stations',
    data: dots,
    beforeId,
    pickable: true,
    getPosition: (d) => d.position,
    getLineColor: (d) => d.color,
    filled: true,
    getFillColor: (d) => (d.busy ? d.color : IDLE),
    stroked: true,
    radiusUnits: 'pixels',
    getRadius: 4,
    lineWidthUnits: 'pixels',
    getLineWidth: 2,
    updateTriggers: { getFillColor: busyVersion },
  })
}

/** What has to be rebuilt when the camera zooms, and the gap it was built with. */
export interface CameraLayers {
  shared: ReturnType<typeof sharedLineLayer>
  dots: StationDot[]
  gap: number
}

/**
 * The geometry that depends on the camera, rebuilt only when the zoom changes.
 *
 * The separation between two lines on one alignment is a constant number of
 * pixels, so the metres it means change every time the camera zooms — and the
 * drawn path, the station markers on it and the trains running on it all have
 * to move together or they come apart.
 *
 * Not every frame: a `PathLayer` re-tessellates its whole `data` and
 * `stationDots` walks 187 stops, neither of which belongs in a loop that runs
 * sixty times a second. The returned function hands back the very same objects
 * until the zoom actually changes, which is also how deck.gl is told that
 * nothing about that layer has changed.
 *
 * The latitude is read at rebuild time rather than triggering one. It enters
 * through `cos(lat)`, and the Klang Valley spans 0.3 degrees at latitude 3, so
 * panning across the whole city moves the gap by less than a fiftieth of a
 * percent.
 *
 * The set of hidden lines is the second trigger, for the same reason and with
 * the same treatment: it changes which lines are in the data, so the geometry
 * has to be rebuilt — but only when it changes, which is when somebody presses
 * a checkbox. Compared by identity, so the store hands out a new Set each time.
 */
export function cameraLayers(
  rail: PreparedNetwork,
  corridors: Corridors,
  beforeId: string,
): (zoom: number, lat: number, hidden?: ReadonlySet<string>) => CameraLayers {
  let lastZoom = NaN
  let lastHidden: ReadonlySet<string> = EMPTY
  let built: CameraLayers | null = null
  return (zoom, lat, hidden = EMPTY) => {
    if (!built || zoom !== lastZoom || hidden !== lastHidden) {
      lastZoom = zoom
      lastHidden = hidden
      const gap = gapMetres(zoom, lat)
      built = {
        shared: sharedLineLayer(rail, corridors, gap, beforeId, hidden),
        dots: stationDots(rail, corridors, gap, hidden),
        gap,
      }
    }
    return built
  }
}

/** The whole network, for one camera: the plain lines, the shared ones, and every stop. */
export function networkLayers(
  rail: PreparedNetwork,
  corridors: Corridors,
  gap: number,
  beforeId: string,
) {
  return [
    lineLayer(rail, corridors, beforeId),
    sharedLineLayer(rail, corridors, gap, beforeId),
    stationLayer(stationDots(rail, corridors, gap), beforeId, 0),
  ] as const
}
