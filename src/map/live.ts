import { IconLayer } from '@deck.gl/layers'
import { freshness, LIVE_MODES } from '../live/feed'
import type { LiveMode, LiveVehicle } from '../live/feed'
import type { LiveStore } from '../ui/store'
import type { Interleaved } from './layers'
import type { MapMode } from './modes'

type Rgb = [number, number, number]

/**
 * How live vehicles look.
 *
 * Taste, not contract, like `WIREFRAME`: tune it by eye. What IS contract is
 * that live vehicles cannot be taken for scheduled trains - those are
 * line-coloured 3D models, these are flat markers in two colours no rail line
 * uses (`live.test.ts` checks) - and that buses do not bury the network at city
 * zoom: they are small, translucent, and drawn underneath it.
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
  /** Marker size in pixels, zoomed out (zoom 10) and close in (zoom 15). Linear between. */
  sizePx: {
    bus: [10, 18],
    ktm: [14, 22],
  } as Record<LiveMode, [far: number, near: number]>,
  /** Alpha for a current report, and for a stale one, which is also drawn hollow. */
  alpha: { fresh: 240, stale: 150 },
} as const

const FAR_ZOOM = 10
const NEAR_ZOOM = 15

/**
 * The four markers, white on transparent, drawn as a mask so `getColor` colours
 * them. A bus is an arrowhead pointing UP (north, before rotation); a KTM ETS
 * train is a disc, because its feed's bearings are placeholders and a disc makes
 * no claim about direction. Stale is the same shape, hollow - a difference that
 * survives the wireframe view, where fading alone is hard to see.
 */
const ARROW = '32,5 55,58 32,45 9,58'
const ATLAS_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="64" viewBox="0 0 256 64">` +
  `<polygon points="${ARROW}" fill="#fff"/>` +
  `<polygon points="${ARROW}" transform="translate(64 0)" fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"/>` +
  `<circle cx="160" cy="32" r="27" fill="#fff"/>` +
  `<circle cx="224" cy="32" r="24" fill="none" stroke="#fff" stroke-width="7"/>` +
  `</svg>`
const ICON_ATLAS = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ATLAS_SVG)}`
const icon = (x: number) => ({ x, y: 0, width: 64, height: 64, mask: true })
const ICON_MAPPING = {
  'bus-fresh': icon(0),
  'bus-stale': icon(64),
  'ktm-fresh': icon(128),
  'ktm-stale': icon(192),
}

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

/** Pixel size of a mode's marker at a zoom. Flat outside the two ends, so nothing jumps. */
export function livePx(mode: LiveMode, zoom: number): number {
  const [far, near] = LIVE_STYLE.sizePx[mode]
  const t = Math.min(1, Math.max(0, (zoom - FAR_ZOOM) / (NEAR_ZOOM - FAR_ZOOM)))
  return far + (near - far) * t
}

/** One drawn vehicle. The report itself, so a pick can describe it. */
export interface LiveItem {
  v: LiveVehicle
  stale: boolean
}

/**
 * The reports to draw, and a key that changes exactly when the drawing would:
 * a new response (the version), or a vehicle crossing a threshold. Gone
 * reports are left out - past ten minutes a vehicle is not drawn at all.
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
    if (f !== 'gone') items.push({ v, stale: f === 'stale' })
  }
  return { items, key: `${version}|${notFresh.join(',')}` }
}

/** Zoom rounded to where a size change would show. Rebuilding for every fraction would be for nothing. */
const band = (zoom: number) => Math.round(zoom * 4) / 4

/** How often freshness is re-checked between responses. It only changes at 4 and 10 minutes. */
const CHECK_MS = 250

// Stable, module-level accessors. deck.gl compares accessor functions by
// reference, so a fresh arrow per build would regenerate every attribute.
const getPosition = (d: LiveItem) => d.v.position
const getAngle = (d: LiveItem) => (d.v.bearing === null ? 0 : angleFor(d.v.bearing))
const getIcon = (d: LiveItem) => `${d.v.mode}-${d.stale ? 'stale' : 'fresh'}`

function liveLayer(mode: LiveMode, items: LiveItem[], zoom: number, view: MapMode, beforeId: string) {
  const [r, g, b] = LIVE_STYLE.color[view][mode]
  const fresh: [number, number, number, number] = [r, g, b, LIVE_STYLE.alpha.fresh]
  const stale: [number, number, number, number] = [r, g, b, LIVE_STYLE.alpha.stale]
  return new IconLayer<LiveItem, Interleaved>({
    id: `live-${mode}`,
    data: items,
    beforeId,
    pickable: true,
    iconAtlas: ICON_ATLAS,
    iconMapping: ICON_MAPPING,
    // Lying on the ground, so an arrow's heading is a direction on the map and
    // turns with it. A billboard would point relative to the screen instead.
    billboard: false,
    sizeUnits: 'pixels',
    getSize: livePx(mode, zoom),
    getPosition,
    getIcon,
    getAngle,
    getColor: (d) => (d.stale ? stale : fresh),
  })
}

type Built = { key: string; band: number; view: MapMode; checked: number; layer: IconLayer<LiveItem, Interleaved> }

/**
 * The live layers for a frame, rebuilt only when something visible changed.
 *
 * Called every frame. Freshness is re-checked when a new response arrives and
 * otherwise every quarter-second; a layer is rebuilt only when the version,
 * the set of stale or gone vehicles, the zoom band, or the map view moved. Every other frame
 * gets the same instances back, which is how deck.gl is told nothing changed.
 *
 * A mode switched off is left out entirely, and forgotten. While the clock is
 * not live the caller passes every mode as off, so the same rule covers it.
 */
export function liveLayers(beforeId: string) {
  const built: Partial<Record<LiveMode, Built>> = {}
  return (feeds: LiveStore, off: ReadonlySet<LiveMode>, nowMs: number, zoom: number, view: MapMode) => {
    const out: IconLayer<LiveItem, Interleaved>[] = []
    for (const mode of LIVE_MODES) {
      if (off.has(mode)) {
        // Forget it. deck.gl finalizes a layer the moment it leaves the list,
        // and handing that dead instance back when the mode returns fails an
        // assertion and leaves the vehicles undrawn and unpickable until the
        // next rebuild.
        delete built[mode]
        continue
      }
      const feed = feeds[mode]
      const had = built[mode]
      const z = band(zoom)
      const due =
        !had ||
        had.band !== z ||
        had.view !== view ||
        !had.key.startsWith(`${feed.version}|`) ||
        nowMs - had.checked >= CHECK_MS
      if (!due) {
        out.push(had.layer)
        continue
      }
      const { items, key } = liveItems(feed.held, feed.version, nowMs)
      if (had && had.key === key && had.band === z && had.view === view) {
        had.checked = nowMs
        out.push(had.layer)
        continue
      }
      const layer = liveLayer(mode, items, z, view, beforeId)
      built[mode] = { key, band: z, view, checked: nowMs, layer }
      out.push(layer)
    }
    return out
  }
}
