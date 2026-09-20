import { ColumnLayer } from '@deck.gl/layers'
import { ScenegraphLayer } from '@deck.gl/mesh-layers'
import type { Mode, PreparedNetwork } from '../sim'
import { hexToRgb } from './layers'
import type { Interleaved, StationDot } from './layers'
import { MODEL_W, VIADUCT_M, halfWidth, yawFor } from './trains'
import stationBrt from './models/station-brt.gltf?url'
import stationLrt from './models/station-lrt.gltf?url'
import stationMrl from './models/station-mrl.gltf?url'
import stationMrt from './models/station-mrt.gltf?url'

type Rgb = [number, number, number]

/**
 * A place: one named station, however many lines call there.
 *
 * The per-line rings are untouched and stay one per platform, because they
 * carry two things nothing here does — which line a platform belongs to, and
 * whether a train is standing at it. The division is that **the model and the
 * beacon say "a station is here", and the rings say which lines and which is
 * busy.** Four rings at Titiwangsa are right, because four lines really do stop
 * there. Four station models would be a pile.
 */
export interface Place {
  /** The station name, which is also what the grouping was done on. */
  name: string
  /** Every line calling here, in the order the feed lists them. */
  lines: string[]
  /** Which model this is drawn with. At an interchange, the heaviest railway present. */
  mode: Mode
  color: Rgb
  position: [lon: number, lat: number, z: number]
  /** Compass bearing of the track, so the platforms lie along it. */
  bearing: number
  /** 1 out in the suburbs, less where stations crowd each other. See `CROWD_M`. */
  crowding: number
}

/**
 * The colour of a place several lines call at.
 *
 * A place with one line takes that line's colour and reads immediately. A place
 * with several has no single colour, and averaging them gives mud — so it takes
 * this instead, which has the side effect of marking every interchange at a
 * glance. That is useful information rather than a compromise.
 *
 * A mid grey-blue, chosen to sit against both map modes: the city map is pale
 * and the wireframe is near-black, and a neutral that works on one can vanish
 * into the other. Taste, and meant to be adjusted by eye.
 */
export const NEUTRAL: Rgb = [168, 176, 190]

/**
 * Which model an interchange is drawn with: the heaviest railway calling there.
 *
 * Titiwangsa has two LRT lines, an MRT line and the monorail, and something has
 * to be drawn. The largest structure present is the least surprising answer,
 * and where an MRT line meets an LRT one it is also what is actually built.
 *
 * Doubling as the order the model layers are built in, which is why it is a
 * list and not a table.
 */
const MODE_RANK: Mode[] = ['MRT', 'LRT', 'MRL', 'BRT']

/** The station model for each mode. Four modes, four models. */
export const STATION_MODEL_URL: Record<Mode, string> = {
  LRT: stationLrt,
  MRT: stationMrt,
  MRL: stationMrl,
  BRT: stationBrt,
}

/** How near another place has to be to count as crowding this one, in metres. */
export const CROWD_M = 900

/** How much each crowding neighbour takes off a beacon, and how far that can go. */
const CROWD_FALLOFF = 0.3
const CROWD_FLOOR = 0.35

/**
 * Every named station, once, from the DRAWN positions of its platforms.
 *
 * Grouped by name, and exact equality is enough rather than a heuristic: the
 * closest two differently-named stops in this feed are 230 m apart, while two
 * platforms of one station can be nearly 300 m apart (Ampang Park). A distance
 * rule would get both of those wrong; the name gets both right. 187 stops come
 * out as 160 places, 22 of them served by more than one line.
 *
 * The position is the mean of the members' drawn positions — not the feed's
 * coordinates, which sit up to 105 m off the track, and not a fresh `pointAt`,
 * which would miss the sideways offset a line carries where it shares an
 * alignment. Those positions move when the camera zooms, and this is computed
 * from them in the same pass, so a place moves with its own platforms.
 *
 * Hidden lines are already out of `dots`, so a place whose every line is hidden
 * simply does not appear, and one with a line left shrinks to what is showing.
 */
export function stationPlaces(rail: PreparedNetwork, dots: readonly StationDot[]): Place[] {
  const modeOf = new Map(rail.lines.map((line) => [line.id, line.mode]))
  const colorOf = new Map(rail.lines.map((line) => [line.id, hexToRgb(line.color)]))

  // The name is the whole grouping key. A stop the feed has no station record
  // for falls back to its own id, which groups it with nothing — one extra
  // marker, visible, rather than a silent merge into a neighbour.
  const byName = new Map<string, StationDot[]>()
  for (const dot of dots) {
    const name = rail.stations[dot.id]?.name ?? dot.id
    const found = byName.get(name)
    if (found) found.push(dot)
    else byName.set(name, [dot])
  }

  const places: Place[] = []
  for (const [name, members] of byName) {
    const lines = [...new Set(members.map((dot) => dot.line))]
    const mode = lines
      .map((id) => modeOf.get(id) ?? 'LRT')
      .reduce((a, b) => (MODE_RANK.indexOf(b) < MODE_RANK.indexOf(a) ? b : a))
    places.push({
      name,
      lines,
      mode,
      // One line, one colour. Several, and the neutral says "interchange".
      color: lines.length === 1 ? colorOf.get(lines[0]) ?? NEUTRAL : NEUTRAL,
      position: [
        members.reduce((sum, dot) => sum + dot.position[0], 0) / members.length,
        members.reduce((sum, dot) => sum + dot.position[1], 0) / members.length,
        VIADUCT_M,
      ],
      // The first platform's bearing, not an average of them. At an interchange
      // the lines cross, so any single answer is arbitrary — and averaging
      // angles that point in different directions is arbitrary too, at the cost
      // of a circular mean to be arbitrary in.
      bearing: members[0].bearing,
      crowding: 1,
    })
  }
  crowd(places, rail)
  return places
}

/**
 * How boxed-in each place is, so the beacons do not become a forest.
 *
 * The failure mode of a column per station is the city centre turning into a
 * palisade, and the levers against it are width, translucency and this. Counted
 * in the network's own flat projection, like every other distance in the app.
 *
 * 160 x 160 pairs on every zoom change. Two things keep that cheap: the
 * coordinates are projected into metres once, into plain arrays, and the
 * comparison is against the SQUARE of the radius, so no distance is ever
 * rooted. Written the obvious way — `Math.hypot` on the objects themselves —
 * the whole of `stationPlaces` measured 1.17 ms, a tenth of a frame on every
 * notch of a zoom wheel; as it stands it measures 0.33 ms.
 */
function crowd(places: Place[], rail: PreparedNetwork): void {
  const { kx, ky } = rail.origin
  const xs = places.map((p) => p.position[0] * kx)
  const ys = places.map((p) => p.position[1] * ky)
  const within = CROWD_M * CROWD_M
  for (let i = 0; i < places.length; i++) {
    // Starts at -1 because the loop below always finds the place itself.
    let near = -1
    for (let j = 0; j < places.length; j++) {
      const dx = xs[i] - xs[j]
      const dy = ys[i] - ys[j]
      if (dx * dx + dy * dy < within) near++
    }
    places[i].crowding = Math.max(CROWD_FLOOR, 1 / (1 + CROWD_FALLOFF * near))
  }
}

/**
 * The zoom band the station model fades in over, and the one the beacon fades
 * out over.
 *
 * They overlap on purpose. Both are sized from the camera, so both hold a
 * constant size on screen — a station model is about twenty-five pixels long at
 * any zoom — and what changes with distance is not legibility but clutter. At
 * zoom 13.5, where the model starts to appear, a kilometre of track is 75 px,
 * so neighbouring stations nearly touch and anything further out is a pile;
 * a 3 px column at the same distance is not.
 *
 * The beacon reaches full strength well before the model has gone, which is the
 * point: two layers at half opacity read as one faint thing, not as a
 * transition, so the sum never dips below one. `places.test.ts` holds that.
 */
export const MODEL_FADE: [number, number] = [13.5, 15.0]
export const BEACON_FADE: [number, number] = [15.0, 16.2]

/** 0 below `from`, 1 above `to`, straight line between. */
function ramp(x: number, [from, to]: [number, number]): number {
  return Math.max(0, Math.min(1, (x - from) / (to - from)))
}

/** How strongly each of the two markings is drawn at `zoom`. */
export function crossfade(zoom: number): { model: number; beacon: number } {
  return { model: ramp(zoom, MODEL_FADE), beacon: 1 - ramp(zoom, BEACON_FADE) }
}

/**
 * How tall a beacon is, in metres.
 *
 * Its whole job is to clear the buildings: one shorter than the roofline solves
 * nothing, because being hidden behind a tower is the problem it exists for.
 *
 * `W` is the same camera relation the trains are sized by — proportional to how
 * much ground a pixel covers — so the first term keeps a column a constant
 * height on screen, about 65 px, however far back the camera is. The floor is
 * what makes it a real number: liberty draws real OSM building heights, and the
 * Klang Valley's towers cluster around 250-300 m apart from three supertalls
 * (the KLCC pair at 452 m and Merdeka 118 at 679 m). 320 m clears the roofline
 * everywhere except right beside those three; clearing them too would mean a
 * 700 m column over every suburban halt, which is the other failure.
 *
 * The floor only bites above zoom 15, where the beacon is already fading.
 */
export const BEACON_FLOOR_M = 320
const BEACON_H = 22

/** How wide a beacon is, as a multiple of `W`: about 3.5 px across. Narrow is a lever. */
const BEACON_R = 0.55

/** How solid a beacon is before crowding and the crossfade are applied. */
const BEACON_ALPHA = 0.5

export function beaconHeight(zoom: number, lat: number): number {
  return Math.max(BEACON_FLOOR_M, halfWidth(zoom, lat) * BEACON_H)
}

/**
 * A translucent column per place, in the place's colour.
 *
 * Not pickable, and nor are the models. The rings already answer picks, and
 * they answer with something a place cannot: which line. A column 300 m tall
 * that answered picks would also stand between the pointer and every train
 * behind it.
 *
 * `visible` rather than dropping the layer: a layer that disappears and comes
 * back is rebuilt from nothing, and this one comes back on every zoom out.
 */
export function beaconLayer(
  places: Place[],
  W: number,
  height: number,
  opacity: number,
  beforeId: string,
) {
  return new ColumnLayer<Place, Interleaved>({
    id: 'station-beacons',
    data: places,
    beforeId,
    visible: opacity > 0,
    pickable: false,
    // Translucent, and both halves of that are here: a base strength the whole
    // layer is drawn at, times the crossfade. deck.gl multiplies `opacity` into
    // the alpha in the shader, so this is a uniform and changing it every frame
    // costs nothing — where an alpha baked into `getFillColor` would rebuild
    // the colour attribute of all 160 columns instead.
    opacity: BEACON_ALPHA * opacity,
    // Eight sides. At three or four pixels across nobody can count them, and
    // twenty (the default) is 160 columns' worth of triangles to prove it.
    diskResolution: 8,
    radius: W * BEACON_R,
    extruded: true,
    // No lighting: the colour is the line's, and a lit column would shade half
    // of it away into something that is no longer that colour.
    material: false,
    getPosition: (d) => d.position,
    getElevation: height,
    // Only the crowding, which changes with the data and nothing else.
    getFillColor: (d): [number, number, number, number] => [...d.color, 255 * d.crowding],
  })
}

/**
 * One `ScenegraphLayer` per mode, as the trains are drawn.
 *
 * `getColor` multiplies the model's base-colour texture and REPLACES a
 * material's own colour factor, which is why these models shade themselves with
 * a texture — the same finding the train models cost a design iteration to
 * learn. See the header of `scripts/build_train_models.mjs`.
 *
 * ponytail: the grouping runs every frame over 160 places rather than being
 * cached, which is a fifth of the work `trainInstances` already does per frame.
 */
export function stationModelLayers(
  places: Place[],
  W: number,
  opacity: number,
  beforeId: string,
) {
  const byMode: Record<Mode, Place[]> = { LRT: [], MRT: [], MRL: [], BRT: [] }
  for (const place of places) byMode[place.mode].push(place)
  return MODE_RANK.map(
    (mode) =>
      new ScenegraphLayer<Place, Interleaved>({
        id: `station-models-${mode}`,
        data: byMode[mode],
        beforeId,
        visible: opacity > 0,
        pickable: false,
        opacity,
        scenegraph: STATION_MODEL_URL[mode],
        _lighting: 'flat',
        // The same scale the trains use, so a station and the train standing at
        // it hold their proportions at every zoom.
        sizeScale: W / MODEL_W,
        getPosition: (d) => d.position,
        // Laid along the track. `yawFor` turns a compass bearing into deck.gl's
        // yaw, which is measured anticlockwise from east — a reflection, not a
        // shift. Getting it wrong looks fine on straight track and wrong on
        // curves, which is why it is one function with one test.
        getOrientation: (d): [number, number, number] => [0, yawFor(d.bearing), 0],
        getColor: (d) => d.color,
      }),
  )
}
