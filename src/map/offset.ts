import { pointAt } from '../sim'
import type { LonLat, Origin, Point, PreparedLine, PreparedNetwork } from '../sim'

/**
 * The gap between two lines that share an alignment, in SCREEN PIXELS.
 *
 * Pixels, not metres, and that is the whole point of this module. A separation
 * measured on the ground scales with the camera: one wide enough to read when
 * the whole Klang Valley is in view puts two services a block apart at street
 * level, and one that looks right at street level is sub-pixel from above and
 * the two lines merge back into the stripe this exists to remove.
 *
 * Six pixels between the centres of two four-pixel lines leaves two pixels of
 * daylight. The consequence is that the drawn geometry depends on the zoom, so
 * it has to be rebuilt when the zoom changes — see `cameraLayers` in layers.ts.
 */
export const GAP_PX = 6

/**
 * How far the offset takes to ramp from nothing to the full gap, in metres.
 *
 * Only at an end where the corridor stops mid-line. Without it the drawn line
 * steps sideways by the whole gap in a single segment; with it the eye reads
 * two tracks converging into a junction, which is what is physically there.
 */
export const TAPER_M = 300

/** One stretch of a line that runs along the same geometry as another line. */
export interface Corridor {
  /** Metres along the line's stored path, in the sense direction 0 runs. */
  from: number
  to: number
  /**
   * Which side of the true alignment this line is drawn on, and how far, in
   * gaps. Two lines get -0.5 and +0.5, so the pair straddles the real track.
   * Positive is to the left of the stored path's direction.
   */
  slot: number
  /** True when the corridor starts (ends) mid-line, so the offset must ramp. */
  taperIn: boolean
  taperOut: boolean
  /** Every line on this stretch, this one included, sorted by id. */
  lines: string[]
}

/** Line id -> the stretches of it that share an alignment. Lines that share nothing are absent. */
export type Corridors = ReadonlyMap<string, Corridor[]>

/** A path vertex as a key. Exact equality: see `sharedCorridors`. */
function key(vertex: LonLat): string {
  return `${vertex[0]},${vertex[1]}`
}

/**
 * Every stretch where two or more lines are drawn on the same geometry.
 *
 * Found in the data, never listed in the app. Hardcoding "Ampang and Sri
 * Petaling" would work today and go quietly wrong the day a refreshed feed
 * interlines a different pair.
 *
 * Exact coordinate equality is enough. The shipped feed's 89 shared vertices
 * are byte-identical, and no other pair of lines shares a single vertex, so a
 * tolerance would only add a threshold to be wrong about.
 *
 * Two details the shipped data forced:
 *
 * - The shared vertices are NOT contiguous. Ampang shares 89 of the 99
 *   vertices between index 22 and index 120; the other ten are places where
 *   one line carries curve detail the other does not, leaving gaps of up to
 *   371 m. A corridor therefore runs from the first shared vertex to the last
 *   one with the same set of lines, and an unshared vertex in between does not
 *   end it — otherwise the drawn line would snap back to the centre ten times
 *   along the stretch. The assumption: a line does not leave a partner and
 *   rejoin the same partner later. Nothing in this feed does.
 * - A single shared vertex is a crossing, not a corridor, so a stretch needs
 *   at least two.
 */
export function sharedCorridors(rail: PreparedNetwork): Corridors {
  // Which lines touch each vertex of the whole network.
  const owners = new Map<string, string[]>()
  for (const line of rail.lines) {
    for (const vertex of line.path) {
      const k = key(vertex)
      const ids = owners.get(k)
      if (!ids) owners.set(k, [line.id])
      else if (!ids.includes(line.id)) ids.push(line.id)
    }
  }

  const corridors = new Map<string, Corridor[]>()
  for (const line of rail.lines) {
    const found: Corridor[] = []
    let sharedWith = ''
    let first = -1
    let last = -1

    // Sorted by id, so the slots below are the same on every run. Feed order
    // would do today, but a reordered feed would swap the two lines' sides.
    const close = () => {
      if (!sharedWith || last <= first) return
      const lines = sharedWith.split(' ')
      found.push({
        from: line.cum[first],
        to: line.cum[last],
        slot: lines.indexOf(line.id) - (lines.length - 1) / 2,
        taperIn: line.cum[first] > 0,
        taperOut: line.cum[last] < line.total,
        lines,
      })
    }

    for (let i = 0; i < line.path.length; i++) {
      const ids = owners.get(key(line.path[i]))
      if (!ids || ids.length < 2) continue
      const k = [...ids].sort().join(' ')
      if (k !== sharedWith) {
        close()
        sharedWith = k
        first = i
      }
      last = i
    }
    close()

    if (found.length) corridors.set(line.id, found)
  }
  return corridors
}

/**
 * How far off the true alignment `line` is drawn at `at` metres along it, in
 * gaps — so 0.5 means half a gap to the left of the stored direction.
 *
 * Zero away from a corridor, and tapering to exactly zero at an end that is
 * not a terminus. At a terminus it does not taper: two parallel stubs at a
 * two-platform station are honest enough.
 */
export function offsetAt(corridors: Corridors, lineId: string, at: number): number {
  for (const c of corridors.get(lineId) ?? []) {
    if (at < c.from || at > c.to) continue
    let ramp = 1
    if (c.taperIn) ramp = Math.min(ramp, (at - c.from) / TAPER_M)
    if (c.taperOut) ramp = Math.min(ramp, (c.to - at) / TAPER_M)
    return c.slot * Math.max(0, Math.min(1, ramp))
  }
  return 0
}

/**
 * How much ground one screen pixel covers, in metres.
 *
 * The Mercator ground resolution. It ignores the map's pitch, where the
 * prototype used the true eye-to-target distance. Close enough for sizing
 * something; do not reuse it for anything that has to be exact.
 */
export function metresPerPixel(zoom: number, lat: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
}

/** `GAP_PX` in metres, for the camera in hand. */
export function gapMetres(zoom: number, lat: number): number {
  return GAP_PX * metresPerPixel(zoom, lat)
}

/**
 * The point `metres` to the LEFT of the direction of travel at `point`.
 *
 * Trains keep left in Malaysia, and a line sharing an alignment is drawn to
 * one side of it: both are the same perpendicular shift, so both are this
 * function, and a train on a shared stretch simply adds the two distances.
 *
 * At compass bearing B the left-hand direction is `(-cos B, +sin B)` in
 * (east, north) components — the unit vector at B - 90. Those metres become
 * degrees through the network's own flat projection, never haversine or turf:
 * every distance in this app was built against that projection, and mixing in
 * a geodesic one would move them all.
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
 * Where `at` metres along `line` is DRAWN: on the true alignment, or beside it
 * where the line shares that alignment with another.
 *
 * The one place the offset is turned into a position, so the path, the station
 * markers and the trains cannot drift apart from each other.
 */
export function offsetPoint(
  line: PreparedLine,
  corridors: Corridors,
  gap: number,
  at: number,
): LonLat {
  const p = pointAt(line, at, false)
  const slot = offsetAt(corridors, line.id, at)
  return slot === 0 ? [p.lon, p.lat] : keepLeft(p, line.origin, slot * gap)
}

/** A line's drawn path, vertex by vertex, at height `z`. */
export function offsetPath(
  line: PreparedLine,
  corridors: Corridors,
  gap: number,
  z: number,
): [number, number, number][] {
  if (!corridors.has(line.id)) return line.path.map(([lon, lat]) => [lon, lat, z])
  return line.path.map((_, i) => {
    const [lon, lat] = offsetPoint(line, corridors, gap, line.cum[i])
    return [lon, lat, z]
  })
}
