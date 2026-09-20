import { ScenegraphLayer } from '@deck.gl/mesh-layers'
import type { Mode, PreparedNetwork } from '../sim'
import type { StationSelection } from '../ui/store'
import { hexToRgb } from './layers'
import type { Interleaved, StationDot } from './layers'
import { MODEL_W, VIADUCT_M, yawFor } from './trains'
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
 * whether a train is standing at it. The division is that **the model says "a
 * station is here", and the rings say which lines and which is busy.** Four
 * rings at Titiwangsa are right, because four lines really do stop there. Four
 * station models would be a pile.
 */
export interface Place {
  /** The station name, which is also what the grouping was done on. */
  name: string
  /** Every line calling here, in the order the feed lists them. */
  lines: string[]
  /**
   * Every platform here: which line, and the stop id the timetable knows it
   * by. This is what turns a pick on the model back into something the card
   * can describe — a place is a drawing, and a selection is per line and stop.
   */
  stops: { line: string; id: string }[]
  /** Which model this is drawn with. At an interchange, the heaviest railway present. */
  mode: Mode
  color: Rgb
  position: [lon: number, lat: number, z: number]
  /** Compass bearing of the track, so the platforms lie along it. */
  bearing: number
}

/**
 * The colour of a place several lines call at.
 *
 * A place with one line takes that line's colour and reads immediately. A place
 * with several has no single colour, and averaging them gives mud — so it takes
 * this instead, which has the side effect of marking every interchange at a
 * glance. That is useful information rather than a compromise.
 *
 * Near-white, and deliberately the brightest thing among the stations. A muted
 * grey-blue was the first answer and it was the wrong one: it made the quietest
 * marks on the map exactly where the most lines meet. This is a colour no line
 * has, so it says "more than one line" by not being any of them.
 *
 * It cannot be brighter than this. The model's texture MULTIPLIES this colour,
 * so white is the ceiling — an interchange is as light as a station can be
 * drawn. Taste, and meant to be adjusted by eye against both map modes.
 */
export const NEUTRAL: Rgb = [238, 242, 248]

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
    // One entry per platform, and the lines are what is left after the
    // duplicates — so the two can never disagree about who calls here.
    const stops = members.map((dot) => ({ line: dot.line, id: dot.id }))
    const lines = [...new Set(stops.map((stop) => stop.line))]
    const mode = lines
      .map((id) => modeOf.get(id) ?? 'LRT')
      .reduce((a, b) => (MODE_RANK.indexOf(b) < MODE_RANK.indexOf(a) ? b : a))
    places.push({
      name,
      lines,
      stops,
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
    })
  }
  return places
}

/**
 * What a pick on a place's model means: one selection per platform.
 *
 * A place with one line gives exactly the selection that platform's ring
 * gives, so the two picks are the same thing said twice and `distinctSelections`
 * folds them together — clicking the model of a suburban station opens its card
 * directly. A place with several gives one per line, and MapView offers the
 * choice, because "Titiwangsa" on its own does not say which of the four
 * timetables you wanted.
 */
export function placeSelections(place: Place): StationSelection[] {
  return place.stops.map((stop) => ({
    kind: 'station',
    lineId: stop.line,
    stopId: stop.id,
  }))
}

/**
 * One `ScenegraphLayer` per mode, as the trains are drawn.
 *
 * `getColor` multiplies the model's base-colour texture and REPLACES a
 * material's own colour factor, which is why these models shade themselves with
 * a texture — the same finding the train models cost a design iteration to
 * learn. See the header of `scripts/build_train_models.mjs`.
 *
 * Pickable, and a second target for the same thing: a ring is 4 px across and a
 * model about 20 px long. It is NOT what makes a station easy to click, though
 * — that is the pick radius in MapView, which costs nothing on screen, where
 * size costs the city centre. A pick here becomes `placeSelections`, which for
 * a place on one line is the very selection its ring gives — so the two fold
 * into one — and for an interchange is the list MapView offers the choice from.
 *
 * A train standing at the platform is not shut out by this. The models leave
 * the track open between their two platforms, so a train is drawn IN that gap
 * rather than inside anything, and both are scaled by the same `W / MODEL_W`,
 * so the gap holds at every zoom — see `sizeScale` below. Seen from the side
 * the near canopy does cross a train's skirt, and there the click finds both
 * and MapView offers the choice rather than answering for you.
 *
 * ponytail: the grouping runs every frame over 160 places rather than being
 * cached, which is a fifth of the work `trainInstances` already does per frame.
 */
export function stationModelLayers(places: Place[], W: number, beforeId: string) {
  const byMode: Record<Mode, Place[]> = { LRT: [], MRT: [], MRL: [], BRT: [] }
  for (const place of places) byMode[place.mode].push(place)
  return MODE_RANK.map(
    (mode) =>
      new ScenegraphLayer<Place, Interleaved>({
        id: `station-models-${mode}`,
        data: byMode[mode],
        beforeId,
        pickable: true,
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
