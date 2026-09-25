import { IconLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers'
import { ScenegraphLayer } from '@deck.gl/mesh-layers'
import { freshness, LIVE_MODES } from '../live/feed'
import type { LiveMode, LiveVehicle } from '../live/feed'
import type { BusShape, BusShapes, BusStop } from '../live/busdata'
import { drawnAt, onFix } from '../live/estimate'
import type { Drawn, Still, Track } from '../live/estimate'
import { pointAt } from '../sim'
import type { LiveFeeds, TransitView } from '../ui/store'
import type { Interleaved } from './layers'
import type { MapMode } from './modes'
import { MODEL_W, yawFor } from './trains'
import busModel from './models/bus.gltf?url'
import etsModel from './models/ets.gltf?url'

type Rgb = [number, number, number]

/**
 * How live vehicles look.
 *
 * Taste, not contract, like `WIREFRAME`: tune it by eye. What IS contract is
 * that live vehicles cannot be taken for scheduled trains - those are
 * line-coloured, elevated models; these are in two colours no rail line uses
 * (`live.test.ts` checks), at street level, a rigid bus where the BRT is
 * articulated and a round puck for KTM ETS - and that buses do not bury the
 * network at city zoom in the rail view: there they are small flat arrows,
 * translucent, drawn underneath it.
 */
export const LIVE_STYLE = {
  /**
   * Per map view, as the station labels' ink is: the city map is pale and the
   * wireframe near-black, and one colour cannot be seen on both. Buses are one
   * neutral for every route (dark slate on the city, pale slate on the
   * wireframe); KTM ETS is magenta, far from every line colour in the feed.
   */
  color: {
    city: { bus: [62, 78, 96], ktm: [196, 38, 160] },
    wireframe: { bus: [206, 218, 232], ktm: [236, 72, 200] },
  } as Record<MapMode, Record<LiveMode, Rgb>>,
  /** The rail view's bus arrow, in pixels, zoomed out (zoom 10) and close in (zoom 15). Linear between. */
  arrowPx: [10, 18] as [far: number, near: number],
  /** An arrow's alpha for a current report, and for a stale one, which is also drawn hollow. */
  alpha: { fresh: 240, stale: 150 },
  /**
   * The models (buses in the bus view, KTM ETS in both). A solid cannot be
   * drawn hollow, so a stale one is its colour mixed `staleGrey` of the way to
   * mid grey, at `alpha.stale`. A fresh one is opaque: a translucent solid
   * shows its own far side through itself. Tuned by eye (task 8.4).
   */
  model: { freshAlpha: 255, staleGrey: 0.55 },
  /**
   * Bus stops, bus view only: a small dot in the buses' own colour with an
   * outline that contrasts with the ground, so a stop reads as "bus" and stands
   * off both the pale city and the dark wireframe. Tuned by eye (task 7.3).
   */
  stop: {
    city: { fill: [62, 78, 96], line: [255, 255, 255] },
    wireframe: { fill: [206, 218, 232], line: [6, 10, 18] },
  } as Record<MapMode, { fill: Rgb; line: Rgb }>,
  /** A stop's radius and outline, in pixels. */
  stopPx: { radius: 3.5, line: 1.5 },
  /**
   * The selected bus's route shape, which its estimate follows: a thin line in
   * the buses' own colour, drawn under the buses. Taste (task 12.2).
   */
  route: { alpha: 200, widthPx: 3 },
} as const

/**
 * How strongly the rail network (lines, stations, trains, names) is drawn in
 * the bus view: dimmed so buses and stops read first, never hidden, because
 * interchanges are the point. Taste, tuned by eye in both map styles (task 7.3).
 */
export const BUS_VIEW_RAIL_OPACITY = 0.4

/** The zoom from which bus stops are drawn: farther out, 4,053 of them would be a smear. */
export const STOP_MIN_ZOOM = 14

/** Whether bus stops are drawn: in the bus view, at `STOP_MIN_ZOOM` or closer. */
export function stopsShown(view: TransitView, zoom: number): boolean {
  return view === 'bus' && zoom >= STOP_MIN_ZOOM
}

const FAR_ZOOM = 10
const NEAR_ZOOM = 15

/**
 * The rail view's bus arrow, white on transparent, drawn as a mask so
 * `getColor` colours it: an arrowhead pointing UP (north, before rotation).
 * Stale is the same shape, hollow - a difference that survives the wireframe
 * view, where fading alone is hard to see. KTM ETS has no arrow: it is a model
 * in both views.
 */
const ARROW = '32,5 55,58 32,45 9,58'
const ATLAS_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64" viewBox="0 0 128 64">` +
  `<polygon points="${ARROW}" fill="#fff"/>` +
  `<polygon points="${ARROW}" transform="translate(64 0)" fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"/>` +
  `</svg>`
const ICON_ATLAS = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ATLAS_SVG)}`
const icon = (x: number) => ({ x, y: 0, width: 64, height: 64, mask: true })
const ICON_MAPPING = { fresh: icon(0), stale: icon(64) }

/**
 * `IconLayer`'s `getAngle`, in degrees, for a compass bearing.
 *
 * Not a bearing. Read out of the installed @deck.gl/layers
 * (dist/icon-layer/icon-layer-vertex.glsl.js): the icon's corner offset is
 * rotated by `mat2(cos, -sin, sin, cos)` - column-major, so the rotation by
 * -angle - in image space where +y is down, and then `pixelOffset.y *= -1`
 * flips it into a y-up frame. With `billboard: false` that frame lies on the
 * ground with +y north. Work it through and the icon's top edge ends up
 * pointing at `(-sin a, cos a)`: POSITIVE ANGLES TURN ANTICLOCKWISE, from
 * north. A compass bearing turns clockwise, so it is negated. As with `yawFor`,
 * a wrong sign looks right for a bus heading north or south and wrong for one
 * heading east, which is why it has a test.
 */
export function angleFor(bearingDeg: number): number {
  return (360 - bearingDeg) % 360
}

/** A stale model's colour: the fresh one moved `LIVE_STYLE.model.staleGrey` of the way to mid grey. */
export function staleRgb([r, g, b]: readonly number[]): Rgb {
  const t = LIVE_STYLE.model.staleGrey
  const mix = (c: number) => Math.round(c + (128 - c) * t)
  return [mix(r), mix(g), mix(b)]
}

/**
 * Whether a mode is drawn as a 3D model or a flat arrow in a view. KTM ETS is a
 * model everywhere (a round puck, so no heading is claimed). Buses are models
 * in the bus view and #40's arrows in the rail view, where a hundred of them
 * must stay beneath the network.
 */
export function liveKind(mode: LiveMode, view: TransitView): 'model' | 'icon' {
  return mode === 'ktm' || view === 'bus' ? 'model' : 'icon'
}

/** Pixel size of the bus arrow at a zoom. Flat outside the two ends, so nothing jumps. */
export function livePx(zoom: number): number {
  const [far, near] = LIVE_STYLE.arrowPx
  const t = Math.min(1, Math.max(0, (zoom - FAR_ZOOM) / (NEAR_ZOOM - FAR_ZOOM)))
  return far + (near - far) * t
}

/**
 * How a bus is placed once the route shapes have loaded. Null for KTM, and for
 * every bus before the shapes arrive: then it is at its report, and nothing
 * may call it estimated.
 */
export interface Motion {
  /** Drawn at an estimate, moving along its route. The only case that may be called estimated. */
  estimated: boolean
  /** Why it is not moving, when it is not. See `Still`. */
  still: Still | null
  /** The shape it is drawn on, or null when it is at its reported coordinates. */
  shapeId: string | null
}

/** One drawn vehicle: the report, so a pick can describe it, and where it is drawn. */
export interface LiveItem {
  v: LiveVehicle
  stale: boolean
  /** The report's position, its place on its route, or its estimate. */
  position: [lon: number, lat: number]
  /** Compass degrees: along its route while estimated, the reported bearing otherwise. */
  bearing: number | null
  motion: Motion | null
}

/**
 * The reports to draw, each at its report, and a key that changes exactly when
 * the drawing would: a new response (the version), or a vehicle crossing a
 * threshold. Gone reports are left out - past ten minutes a vehicle is not
 * drawn at all. Estimation, where it applies, moves them afterwards.
 */
export function liveItems(
  held: ReadonlyMap<string, LiveVehicle>,
  version: number,
  nowMs: number,
): { items: LiveItem[]; key: string } {
  const items: LiveItem[] = []
  const notFresh: string[] = []
  for (const v of held.values()) {
    const f = freshness(v.fixSec, nowMs)
    if (f !== 'fresh') notFresh.push(`${f[0]}${v.id}`)
    if (f !== 'gone') {
      items.push({ v, stale: f === 'stale', position: v.position, bearing: v.bearing, motion: null })
    }
  }
  return { items, key: `${version}|${notFresh.join(',')}` }
}

/** Zoom rounded to where a size change would show. Rebuilding for every fraction would be for nothing. */
const band = (zoom: number) => Math.round(zoom * 4) / 4

/** How often freshness is re-checked between responses. It only changes at 4 and 10 minutes. */
const CHECK_MS = 250

// Stable, module-level accessors. deck.gl compares accessor functions by
// reference, so a fresh arrow per build would regenerate every attribute.
const getPosition = (d: LiveItem) => d.position
const getAngle = (d: LiveItem) => (d.bearing === null ? 0 : angleFor(d.bearing))
const getIcon = (d: LiveItem) => (d.stale ? 'stale' : 'fresh')

/** Buses in the rail view: #40's flat arrows. */
function arrowLayer(items: LiveItem[], zoom: number, style: MapMode, beforeId: string) {
  const [r, g, b] = LIVE_STYLE.color[style].bus
  const fresh: [number, number, number, number] = [r, g, b, LIVE_STYLE.alpha.fresh]
  const stale: [number, number, number, number] = [r, g, b, LIVE_STYLE.alpha.stale]
  return new IconLayer<LiveItem, Interleaved>({
    id: 'live-bus',
    data: items,
    beforeId,
    pickable: true,
    iconAtlas: ICON_ATLAS,
    iconMapping: ICON_MAPPING,
    // Lying on the ground, so an arrow's heading is a direction on the map and
    // turns with it. A billboard would point relative to the screen instead.
    billboard: false,
    sizeUnits: 'pixels',
    getSize: livePx(zoom),
    getPosition,
    getIcon,
    getAngle,
    getColor: (d) => (d.stale ? stale : fresh),
  })
}

const MODEL_URL: Record<LiveMode, string> = { bus: busModel, ktm: etsModel }
// A bus faces its reported bearing (north when it reported none, as the arrow
// does). ETS takes the default [0, 0, 0]: its puck is eight-fold symmetric.
const getOrientation = (d: LiveItem): [number, number, number] => [0, yawFor(d.bearing ?? 0), 0]

/**
 * A mode as a `ScenegraphLayer`, on the ground (the positions carry no height),
 * scaled like the trains so it holds its size on screen until it floors at
 * real-world metres. Its own id, never the arrow layer's: deck.gl matches layers
 * by id, and handing an IconLayer's state to a ScenegraphLayer would break both.
 */
function modelLayer(
  mode: LiveMode,
  items: LiveItem[],
  style: MapMode,
  W: number,
  opacity: number,
  beforeId: string,
) {
  const rgb = LIVE_STYLE.color[style][mode]
  const fresh: [number, number, number, number] = [...rgb, LIVE_STYLE.model.freshAlpha]
  const stale: [number, number, number, number] = [...staleRgb(rgb), LIVE_STYLE.alpha.stale]
  return new ScenegraphLayer<LiveItem, Interleaved>({
    id: `live-${mode}-model`,
    data: items,
    beforeId,
    opacity,
    pickable: true,
    scenegraph: MODEL_URL[mode],
    // Flat: the path on which `getColor` multiplies the model's palette texture.
    _lighting: 'flat',
    sizeScale: W / MODEL_W,
    getPosition,
    ...(mode === 'bus' ? { getOrientation } : {}),
    getColor: (d) => (d.stale ? stale : fresh),
  })
}

type LiveLayer = IconLayer<LiveItem, Interleaved> | ScenegraphLayer<LiveItem, Interleaved>
type Built = {
  key: string
  band: number
  style: MapMode
  view: TransitView
  W: number
  checked: number
  layer: LiveLayer
  items: LiveItem[]
}

/**
 * What estimation remembers per bus between frames, for both views at once:
 * switching view rebuilds the layer, never this, so a bus never moves for it.
 */
interface BusMotion {
  /** The shapes the tracks were made against. New shapes start everything afresh. */
  shapes: BusShapes | null
  /** The feed version whose reports were last taken in. */
  version: number
  tracks: Map<string, Track>
  drawn: Map<string, Drawn>
}

const shapeFor = (shapes: BusShapes, tripId: string | null): BusShape | null =>
  (tripId === null ? undefined : shapes.shapes.get(shapes.trips.get(tripId) ?? '')) ?? null

/**
 * Moves this frame's bus items to where estimation draws them, in place.
 *
 * Reports are taken in (`onFix`) only when the feed's version moved and only
 * for buses whose report changed; `drawnAt` runs for every bus every frame.
 * A bus with no place on a shape keeps its reported position and bearing. A
 * bus on its shape but not moving keeps its reported bearing: only an estimate
 * turns it along the route.
 */
function moveBuses(
  m: BusMotion,
  items: LiveItem[],
  held: ReadonlyMap<string, LiveVehicle>,
  version: number,
  shapes: BusShapes,
  nowMs: number,
) {
  if (m.shapes !== shapes) {
    m.shapes = shapes
    m.version = -1
    m.tracks.clear()
    m.drawn.clear()
  }
  if (m.version !== version) {
    m.version = version
    for (const v of held.values()) {
      const t = m.tracks.get(v.id)
      if (!t || t.fixSec !== v.fixSec) m.tracks.set(v.id, onFix(t, v, shapeFor(shapes, v.tripId)))
    }
    // Buses no longer held (gone for age) are forgotten with them.
    for (const id of m.tracks.keys()) {
      if (!held.has(id)) {
        m.tracks.delete(id)
        m.drawn.delete(id)
      }
    }
  }
  for (const item of items) {
    const track = m.tracks.get(item.v.id)
    if (!track) continue
    const d = drawnAt(m.drawn.get(item.v.id), track, nowMs)
    const shape = d && shapeFor(shapes, track.tripId)
    if (!d || !shape) {
      m.drawn.delete(item.v.id)
      item.motion = { estimated: false, still: track.still, shapeId: null }
      continue
    }
    m.drawn.set(item.v.id, d)
    const p = pointAt(shape, d.at, false)
    const estimated = track.speed !== null
    item.position = [p.lon, p.lat]
    if (estimated) item.bearing = p.bearingDeg
    item.motion = { estimated, still: track.still, shapeId: shape.id }
  }
}

/**
 * The live layers for a frame, rebuilt only when something visible changed.
 *
 * Called every frame. Freshness is re-checked when a new response arrives and
 * otherwise every quarter-second; a layer is rebuilt only when the version,
 * the set of stale or gone vehicles, the zoom band (arrows only), the map
 * style or the transit view moved. Every other frame gets the same instances
 * back, which is how deck.gl is told nothing changed - except that a model's
 * `sizeScale` follows `W` continuously, as the trains' does, by a `clone` that
 * keeps the data and accessors, so no attribute is regenerated.
 *
 * Which layer each view builds is `liveKind`. In the bus view KTM ETS is
 * dimmed with the rail network, because it is a train.
 *
 * A mode switched off is left out entirely, and forgotten. While the clock is
 * not live the caller passes every mode as off, so the same rule covers it.
 */
export function liveLayers(beforeId: string) {
  const built: Partial<Record<LiveMode, Built>> = {}
  const motion: BusMotion = { shapes: null, version: -1, tracks: new Map(), drawn: new Map() }
  /**
   * @param shapes The route shapes once loaded, else null. With them, buses
   *   move on estimates, in both views, and their layer is rebuilt every frame
   *   as the trains' is; without them, every bus is at its report.
   */
  const draw = (
    feeds: LiveFeeds,
    off: ReadonlySet<LiveMode>,
    nowMs: number,
    zoom: number,
    style: MapMode,
    view: TransitView,
    W: number,
    shapes: BusShapes | null = null,
  ) => {
    const out: LiveLayer[] = []
    for (const mode of LIVE_MODES) {
      if (off.has(mode)) {
        // Forget it. deck.gl finalizes a layer the moment it leaves the list,
        // and handing that dead instance back when the mode returns fails an
        // assertion and leaves the vehicles undrawn and unpickable until the
        // next rebuild. Buses' motion goes with it: nothing was drawn meanwhile.
        delete built[mode]
        if (mode === 'bus') motion.shapes = null
        continue
      }
      const feed = feeds[mode]
      const had = built[mode]
      const kind = liveKind(mode, view)
      const moving = mode === 'bus' && shapes !== null
      // Models are sized by `sizeScale`, so only arrows care about the zoom band.
      const z = kind === 'icon' ? band(zoom) : 0
      const same = (b: Built) => b.band === z && b.style === style && b.view === view
      const due =
        moving ||
        !had ||
        !same(had) ||
        !had.key.startsWith(`${feed.version}|`) ||
        nowMs - had.checked >= CHECK_MS
      if (!due) {
        out.push(resized(had, W))
        continue
      }
      const { items, key } = liveItems(feed.held, feed.version, nowMs)
      if (moving) moveBuses(motion, items, feed.held, feed.version, shapes, nowMs)
      else if (had && had.key === key && same(had)) {
        had.checked = nowMs
        out.push(resized(had, W))
        continue
      }
      const dim = mode === 'ktm' && view === 'bus' ? BUS_VIEW_RAIL_OPACITY : 1
      const layer =
        kind === 'icon'
          ? arrowLayer(items, z, style, beforeId)
          : modelLayer(mode, items, style, W, dim, beforeId)
      built[mode] = { key, band: z, style, view, W, checked: nowMs, layer, items }
      out.push(layer)
    }
    return out
  }
  return Object.assign(draw, {
    /** What was drawn for a vehicle on the last frame: where, and whether estimated. */
    item: (mode: LiveMode, id: string): LiveItem | undefined =>
      built[mode]?.items.find((d) => d.v.id === id),
    /**
     * Buses drawn on the last frame that cannot be estimated at all: on a trip
     * the timetable does not have, or off their route. Said in the bus status
     * line, so a gap in the estimate is visible rather than silent.
     */
    unestimated: () => {
      const n = { noShape: 0, offRoute: 0 }
      for (const d of built.bus?.items ?? []) {
        if (d.motion?.still === 'no-shape') n.noShape++
        else if (d.motion?.still === 'off-route') n.offRoute++
      }
      return n
    },
  })
}

/**
 * The selected bus's route shape as a thin path, or null. Only while the bus is
 * estimated: the line shows which way the estimate assumes it is going.
 * Forgotten whenever it is not drawn, like every live layer, so an instance
 * deck.gl has finalized is never handed back.
 */
export function routeLayers(beforeId: string) {
  let built: { shape: BusShape; style: MapMode; layer: PathLayer<BusShape, Interleaved> } | null = null
  return (shape: BusShape | null, style: MapMode) => {
    if (!shape) return (built = null)
    if (!built || built.shape !== shape || built.style !== style) {
      const [r, g, b] = LIVE_STYLE.color[style].bus
      built = {
        shape,
        style,
        layer: new PathLayer<BusShape, Interleaved>({
          // Not 'live-': the pick code reads that prefix as a vehicle. Not pickable either.
          id: 'bus-route',
          data: [shape],
          beforeId,
          getPath: (d) => d.path as [number, number][],
          getColor: [r, g, b, LIVE_STYLE.route.alpha],
          widthUnits: 'pixels',
          getWidth: LIVE_STYLE.route.widthPx,
          capRounded: true,
          jointRounded: true,
        }),
      }
    }
    return built.layer
  }
}

/** A model's layer at the current `W`: the same instance while `W` holds, a clone once it moves. */
function resized(b: Built, W: number): LiveLayer {
  if (b.W !== W && b.layer instanceof ScenegraphLayer) {
    b.layer = b.layer.clone({ sizeScale: W / MODEL_W })
    b.W = W
  }
  return b.layer
}

const stopPosition = (d: BusStop): [number, number] => [d[2], d[3]]

/**
 * The bus stops layer, or null before the stops have arrived.
 *
 * Built when the data arrives, and again only when the map style changes or the
 * stops cross the zoom-and-view gate. That gate is the layer's `visible`, not
 * leaving it out of the list: deck.gl finalizes a layer the moment it leaves,
 * and the rebuild for a flip shares the data and accessors, so nothing is
 * regenerated. Every other frame gets the same instance back.
 *
 * Pickable for the hover, which says the stop's name. A click on a stop selects
 * nothing: there is nothing honest to put in a card for one yet.
 */
export function busStopLayers(beforeId: string) {
  let built: {
    stops: readonly BusStop[]
    style: MapMode
    shown: boolean
    layer: ScatterplotLayer<BusStop, Interleaved>
  } | null = null
  return (stops: readonly BusStop[] | null, style: MapMode, view: TransitView, zoom: number) => {
    if (!stops) return null
    const shown = stopsShown(view, zoom)
    if (!built || built.stops !== stops || built.style !== style || built.shown !== shown) {
      const { fill, line } = LIVE_STYLE.stop[style]
      built = {
        stops,
        style,
        shown,
        layer: new ScatterplotLayer<BusStop, Interleaved>({
          id: 'bus-stops',
          data: stops,
          beforeId,
          visible: shown,
          pickable: true,
          getPosition: stopPosition,
          radiusUnits: 'pixels',
          getRadius: LIVE_STYLE.stopPx.radius,
          filled: true,
          getFillColor: fill,
          stroked: true,
          lineWidthUnits: 'pixels',
          getLineWidth: LIVE_STYLE.stopPx.line,
          getLineColor: line,
        }),
      }
    }
    return built.layer
  }
}
