import { PathLayer, ScatterplotLayer } from '@deck.gl/layers'
import { pointAt } from '../sim'
import type { PreparedNetwork } from '../sim'

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

export interface StationDot {
  id: string
  position: [lon: number, lat: number]
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

/**
 * One dot per stop per line, placed on the track.
 *
 * Not at `stations[id].lon/lat`: the feed's coordinates sit up to 105 m from the
 * rails, so raw they float beside their own line. `stop.at` is a distance along
 * the stored path, and the path is stored in direction 0's sense, so direction 0
 * reads it unreversed. Direction 1 unreversed would mirror every station.
 *
 * Stations shared by two lines appear once per line. That is the feed being
 * honest about per-line stop ids; merging them is later work.
 */
export function stationDots(rail: PreparedNetwork): StationDot[] {
  const dots: StationDot[] = []
  for (const line of rail.lines) {
    const color = hexToRgb(line.color)
    const forward = line.directions.find((d) => d.dir === 0)
    if (!forward) continue
    for (const stop of forward.stops) {
      const p = pointAt(line, stop.at, false)
      dots.push({ id: stop.id, position: [p.lon, p.lat], color, busy: false })
    }
  }
  return dots
}

/** One path over every line. Built once: it re-tessellates when its data changes. */
export function lineLayer(rail: PreparedNetwork, beforeId: string) {
  return new PathLayer<PreparedNetwork['lines'][number], Interleaved>({
    id: 'lines',
    data: rail.lines,
    beforeId,
    getPath: (line) => line.path,
    getColor: (line) => hexToRgb(line.color),
    // Pixels, not metres: a real track is about three metres wide, which at
    // city-wide zoom is less than one pixel and vanishes. A constant pixel
    // width needs no min or max — it is already the same at every zoom.
    widthUnits: 'pixels',
    getWidth: 4,
    capRounded: true,
    jointRounded: true,
  })
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
 */
export function stationLayer(dots: StationDot[], beforeId: string, busyVersion: number) {
  return new ScatterplotLayer<StationDot, Interleaved>({
    id: 'stations',
    data: dots,
    beforeId,
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

/** The whole network: one path layer over every line, one dot layer over every stop. */
export function networkLayers(rail: PreparedNetwork, beforeId: string) {
  return [lineLayer(rail, beforeId), stationLayer(stationDots(rail), beforeId, 0)]
}
