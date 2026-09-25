import { TextLayer } from '@deck.gl/layers'
import type { Place, PreparedNetwork } from '../sim'
import type { Interleaved, StationDot } from './layers'
import { stationRadius } from './layers'
import type { MapMode } from './modes'

type Position = [lon: number, lat: number, z: number]

/**
 * Where each place's name sits: the mean of the rings actually drawn for it.
 *
 * Not `Place.lon/lat`, which is the true alignment. On the shared corridor the
 * rings are pushed sideways by a gap in pixels, so their ground position moves
 * with the zoom, and a name placed on the alignment would float between them.
 * A hidden line has no rings, so its stops drop out of the mean, and a place
 * with no rings left gets no entry at all: that is "labels follow visibility",
 * without a second rule.
 */
export function labelAnchors(
  places: readonly Place[],
  dots: readonly StationDot[],
  index: ReadonlyMap<string, number>,
): Map<string, Position> {
  const anchors = new Map<string, Position>()
  for (const place of places) {
    const drawn = place.stops.flatMap((id) => {
      const i = index.get(id)
      return i === undefined ? [] : [dots[i].position]
    })
    if (drawn.length === 0) continue
    const mean = (k: 0 | 1 | 2) => drawn.reduce((sum, p) => sum + p[k], 0) / drawn.length
    anchors.set(place.id, [mean(0), mean(1), mean(2)])
  }
  return anchors
}

/**
 * 0 for the place holding the selected stop, 1 for an interchange (more than
 * one line) or a terminal (first or last stop of any line's direction 0), 2 for
 * everything else. Found from the data every time, never listed.
 */
export function labelPriority(
  place: Place,
  rail: PreparedNetwork,
  selectedStop?: string,
): 0 | 1 | 2 {
  if (selectedStop !== undefined && place.stops.includes(selectedStop)) return 0
  if (place.lines.length > 1) return 1
  for (const line of rail.lines) {
    const stops = line.directions.find((d) => d.dir === 0)?.stops ?? []
    if (stops.length === 0) continue
    const ends = [stops[0].id, stops[stops.length - 1].id]
    if (place.stops.some((id) => ends.includes(id))) return 1
  }
  return 2
}

/** A label that might be shown, already in screen pixels. */
export interface LabelCandidate {
  /** The place id, which is also its name: the sort uses it as both. */
  id: string
  /** The bottom-centre of the text, already lifted above the rings. */
  x: number
  y: number
  /** Measured text width and line height, in pixels. */
  width: number
  height: number
  priority: 0 | 1 | 2
}

export interface ChooseOptions {
  zoom: number
  /** The viewport, in pixels. */
  width: number
  height: number
}

// Starting values, to be tuned by eye in the browser.
/** Below this zoom only the selected place, interchanges and terminals are named. */
export const GATE_ZOOM = 12
/** No zoom produces more names than this, however much room there is. */
export const MAX_LABELS = 40
/** Clear space kept around every label, in pixels, on every side. */
export const LABEL_PAD = 3

/**
 * Which labels to show: a zoom gate, an off-screen cull, a total sort, then
 * greedy placement, keeping each box only if it overlaps none already kept.
 *
 * The sort is total (priority, then shorter name, then name) so the same view
 * always gives the same answer. Without that, names flicker while panning.
 * Priority 0 is always kept: the station somebody chose is named even if that
 * costs a neighbour its name.
 */
export function chooseLabels(
  candidates: readonly LabelCandidate[],
  { zoom, width, height }: ChooseOptions,
): string[] {
  const order = candidates
    .filter((c) => zoom >= GATE_ZOOM || c.priority < 2)
    .filter((c) => c.x >= 0 && c.x <= width && c.y >= 0 && c.y <= height)
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        a.id.length - b.id.length ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )

  const kept: { id: string; l: number; t: number; r: number; b: number }[] = []
  for (const c of order) {
    if (kept.length >= MAX_LABELS) break
    const box = {
      id: c.id,
      l: c.x - c.width / 2 - LABEL_PAD,
      r: c.x + c.width / 2 + LABEL_PAD,
      t: c.y - c.height - LABEL_PAD,
      b: c.y + LABEL_PAD,
    }
    const hits = kept.some((k) => box.l < k.r && box.r > k.l && box.t < k.b && box.b > k.t)
    if (!hits || c.priority === 0) kept.push(box)
  }
  return kept.map((k) => k.id)
}

/** One name to draw. */
export interface LabelDatum {
  id: string
  position: Position
  selected: boolean
}

export const LABEL_FONT = 'system-ui, sans-serif'
export const LABEL_WEIGHT = 600
export const LABEL_PX = 12
export const SELECTED_PX = 14
/** Clear pixels between the top of the ring and the bottom of its name. */
const LIFT_PX = 10

type Rgba = [number, number, number, number]
/** Dark text on a white halo over the pale city; light text on near-black over the wireframe. */
const INK: Record<MapMode, { text: Rgba; halo: Rgba }> = {
  city: { text: [21, 32, 43, 255], halo: [255, 255, 255, 235] },
  wireframe: { text: [238, 241, 244, 255], halo: [6, 10, 18, 235] },
}

/** How far above its anchor a name is drawn: clear of the ring, which grows when zoomed out. */
export function labelLift(zoom: number): number {
  return stationRadius(zoom) + LIFT_PX
}

export function labelLayer(
  data: readonly LabelDatum[],
  mode: MapMode,
  zoom: number,
  beforeId: string,
) {
  const ink = INK[mode]
  const lift = labelLift(zoom)
  return new TextLayer<LabelDatum, Interleaved>({
    id: 'station-labels',
    data,
    beforeId,
    // Furniture, not a target. A label is large, and if it answered a pick it
    // would answer instead of the train passing in front of it — the reason the
    // track is not pickable either. deck.gl's default; stated so nobody turns it
    // on for symmetry.
    pickable: false,
    getText: (d) => d.id,
    getPosition: (d) => d.position,
    getSize: (d) => (d.selected ? SELECTED_PX : LABEL_PX),
    sizeUnits: 'pixels',
    getColor: ink.text,
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'bottom',
    getPixelOffset: [0, -lift],
    // The app's own font, not deck.gl's default of Monaco.
    fontFamily: LABEL_FONT,
    fontWeight: LABEL_WEIGHT,
    // The glyph atlas is built from the names themselves, so an accented name
    // arriving with a refresh is drawn rather than dropped.
    characterSet: 'auto',
    // SDF glyphs, so the outline can act as a halo that keeps the name legible
    // over any building. A bigger radius and buffer than the defaults leave room
    // in the atlas for a halo wide enough to read at 12 px.
    fontSettings: { sdf: true, radius: 16, buffer: 12 },
    outlineWidth: 12,
    outlineColor: ink.halo,
    parameters: {
      // A name hidden inside a tower is worse than one drawn in front of it: the
      // choose pass would still reserve its space, pushing out a visible name
      // for an invisible one.
      depthCompare: 'always',
      // Drawn after the trains and ignoring depth, so a name is never hidden by
      // one; no depth write, so nothing drawn later is hidden by the name.
      depthWriteEnabled: false,
    },
  })
}
