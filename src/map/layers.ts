import { PathLayer, ScatterplotLayer } from '@deck.gl/layers'
import { pointAt } from '../sim'
import type { PreparedNetwork } from '../sim'

// deck.gl accepts a `beforeId` naming the MapLibre layer to draw beneath, but
// @deck.gl/maplibre does not add it to the public layer prop types, so we say so.
type Interleaved = { beforeId: string }

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
}

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
      dots.push({ id: stop.id, position: [p.lon, p.lat], color })
    }
  }
  return dots
}

/** The whole network: one path layer over every line, one dot layer over every stop. */
export function networkLayers(rail: PreparedNetwork, beforeId: string) {
  return [
    new PathLayer<PreparedNetwork['lines'][number], Interleaved>({
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
    }),
    new ScatterplotLayer<StationDot, Interleaved>({
      id: 'stations',
      data: stationDots(rail),
      beforeId,
      getPosition: (d) => d.position,
      getLineColor: (d) => d.color,
      filled: false,
      stroked: true,
      radiusUnits: 'pixels',
      getRadius: 4,
      lineWidthUnits: 'pixels',
      getLineWidth: 2,
    }),
  ]
}
