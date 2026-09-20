import { ScenegraphLayer } from '@deck.gl/mesh-layers'
import { pointAt } from '../sim'
import type { ActiveTrain, Mode, PreparedNetwork } from '../sim'
import { hexToRgb } from './layers'
import type { Interleaved, StationDot } from './layers'
import { keepLeft, metresPerPixel, offsetAt } from './offset'
import type { Corridors } from './offset'
import brtModel from './models/brt.gltf?url'
import lrtModel from './models/lrt.gltf?url'
import mrlModel from './models/mrl.gltf?url'
import mrtModel from './models/mrt.gltf?url'

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
 *
 * It is also load-bearing for picking, which is worth knowing before anybody
 * "flattens" it: a station marker sits at a fraction of a metre, so a train
 * standing at a platform is in front of the marker in the picking depth buffer
 * and wins the pick. Put them at the same height and picks flicker between the
 * train and the platform it is at.
 */
export const VIADUCT_M = 10

/** The colour of a train whose line is somehow not in the colour table. */
const FALLBACK: Rgb = [110, 122, 138]

/** How far to the left of the centre line a train sits, as a multiple of `W`. */
const KEEP_LEFT = 0.8

/**
 * The size the models are authored at, in metres — the `W = 4` floor.
 *
 * Every model is built at the size a train is drawn when the camera is close,
 * so the layer's scale is simply `W / 4`. See `scripts/build_train_models.mjs`
 * for the dimensions themselves and why they are shorter and wider than real
 * rolling stock.
 *
 * The station models are authored against the same unit and scaled by the same
 * `W / MODEL_W` — which is why `places.ts` imports this rather than keeping a
 * second copy of the number. A station and the train standing at it then hold
 * their proportions however far away the camera is.
 */
export const MODEL_W = 4

/** The four modes the feed uses, and the model each one is drawn with. */
export const MODEL_URL: Record<Mode, string> = {
  LRT: lrtModel,
  MRT: mrtModel,
  MRL: mrlModel,
  BRT: brtModel,
}

const MODES = Object.keys(MODEL_URL) as Mode[]

/**
 * Modes the feed has and we have no model for, so the warning is said once
 * rather than sixty times a second.
 *
 * A rebuilt feed could introduce a fifth mode; `src/map/trains.test.ts` checks
 * every mode in the shipped data has a model, so this is the case where the
 * data moved ahead of the code. Those trains go undrawn, and the console says
 * so — quietly dropping them is exactly the kind of silence this project has
 * been bitten by before.
 */
const unknownModes = new Set<string>()

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
 * `metresPerPixel` is the Mercator ground resolution and ignores the map's
 * pitch, where the prototype used the true eye-to-target distance. It is the
 * same relation the line separation in `offset.ts` is measured with, which is
 * why it lives there and not here.
 */
export function halfWidth(zoom: number, lat: number): number {
  return Math.max(4, Math.min(420, 3.05 * metresPerPixel(zoom, lat)))
}

/**
 * deck.gl's yaw, in degrees, for a train on compass bearing `bearingDeg`.
 *
 * `getOrientation` is `[pitch, yaw, roll]`, and yaw is NOT a compass bearing.
 * Read out of the installed @deck.gl/mesh-layers, `calculateTransformMatrix`
 * sends the model's +X axis to `(cos yaw, sin yaw, 0)` in a frame where +x is
 * east and +y is north. So yaw is an ordinary anticlockwise angle measured
 * from east, and turning a clockwise-from-north bearing into it is a
 * reflection, not a shift: `90 - B`, not `B - 90`.
 *
 * The same matrix sends the model's +Y axis to `(-cos B, +sin B)`, which is
 * the very vector `keepLeft` offsets along — so a model built with +X forward
 * and +Y to the left comes out facing and leaning the right way together.
 *
 * This is the shape of mistake the prototype already made once: its Three.js
 * rotation was `180 - B`, a mirror rather than a turn. A wrong sign here looks
 * fine on straight track and wrong only on curves, so it gets a test.
 */
export function yawFor(bearingDeg: number): number {
  return 90 - bearingDeg
}

/** One line colour per line id, parsed once. `hexToRgb` does a parseInt. */
export function lineColors(rail: PreparedNetwork): Map<string, Rgb> {
  return new Map(rail.lines.map((line) => [line.id, hexToRgb(line.color)]))
}

/**
 * One train, as the accessors a `ScenegraphLayer` instance needs, plus enough
 * to say which train was picked.
 *
 * An id and a line id, and not the `ActiveTrain` itself: that record holds
 * references to the line and the direction, and handing them to the renderer
 * would keep a frame's worth of them alive for no reason. The id is looked up
 * against the frame's own list of trains instead.
 */
export interface TrainInstance {
  id: string
  lineId: string
  position: [lon: number, lat: number, z: number]
  /** deck.gl's [pitch, yaw, roll], in degrees. */
  orientation: [number, number, number]
  color: Rgb
}

/**
 * Every running train this frame, grouped by the model it is drawn with.
 *
 * Grouped rather than one flat list because a `ScenegraphLayer` draws one
 * model, so there is a layer per mode and each needs only its own trains.
 *
 * A train on a stretch its line shares with another carries two perpendicular
 * offsets: keeping left of its own direction, and its line's side of the shared
 * alignment. They are shifts in the same frame, so they add.
 *
 * The sign is the part to get right. The drawn path is offset to the left of
 * the STORED direction, while `keepLeft` works from the train's own bearing —
 * and a train running the line backwards is facing the other way, so its left
 * is the path's right. Hence the flip on `reversed`. Without it a returning
 * train runs on the other line's track.
 *
 * `train.at` needs the same care: a direction-1 train measures its distance
 * from its own terminal, so it has to be turned round before it can be looked
 * up against a corridor, which is recorded along the stored path.
 */
export function trainInstances(
  trains: readonly ActiveTrain[],
  W: number,
  colors: ReadonlyMap<string, Rgb>,
  corridors: Corridors,
  gap: number,
): Record<Mode, TrainInstance[]> {
  const byMode: Record<Mode, TrainInstance[]> = { LRT: [], MRT: [], MRL: [], BRT: [] }
  for (const train of trains) {
    // Once per train: this call gives both the position and the bearing the
    // keep-left offset and the model's orientation are built from.
    const p = pointAt(train.line, train.at, train.dir.reversed)
    const along = train.dir.reversed ? train.line.total - train.at : train.at
    const slot = offsetAt(corridors, train.line.id, along) * (train.dir.reversed ? -1 : 1)
    const [lon, lat] = keepLeft(p, train.line.origin, W * KEEP_LEFT + slot * gap)
    const list = byMode[train.line.mode]
    if (!list) {
      if (!unknownModes.has(train.line.mode)) {
        unknownModes.add(train.line.mode)
        console.warn(
          `No train model for mode "${train.line.mode}" (${train.line.id}). ` +
            'Those trains are not being drawn. Add one in scripts/build_train_models.mjs.',
        )
      }
      continue
    }
    list.push({
      id: train.id,
      lineId: train.line.id,
      position: [lon, lat, VIADUCT_M],
      orientation: [0, yawFor(p.bearingDeg), 0],
      color: colors.get(train.line.id) ?? FALLBACK,
    })
  }
  return byMode
}

/**
 * One `ScenegraphLayer` per mode: an LRT set, an MRT set, a monorail and a bus.
 *
 * The per-line colour is `getColor`, which tints the whole model. That works
 * only because the models shade themselves with a base-colour texture rather
 * than material colours: deck.gl's flat lighting path multiplies the instance
 * colour by that texture, and throws a material's own colour away. See the
 * header of `scripts/build_train_models.mjs`.
 *
 * Colour stays data-driven — it comes from `line.color` by way of `colors` — so
 * a new line in the feed is drawn in its own colour with no new model file. A
 * new *mode* would need one, and there are four.
 *
 * `scenegraph` is a URL, and the same string every frame, so deck.gl's async
 * prop resolution fetches it once and reuses it (it compares the value against
 * the last one it saw). While it is still loading the layer's `draw` returns
 * early, so those frames simply have no trains rather than throwing.
 *
 * Rebuilt every frame on purpose. deck.gl layers are immutable descriptors, not
 * GPU state, so a fresh `data` array regenerates the attributes on its own and
 * needs no `updateTriggers`.
 */
export function trainLayers(byMode: Record<Mode, TrainInstance[]>, W: number, beforeId: string) {
  return MODES.map(
    (mode) =>
      new ScenegraphLayer<TrainInstance, Interleaved>({
        id: `trains-${mode}`,
        data: byMode[mode],
        beforeId,
        pickable: true,
        scenegraph: MODEL_URL[mode],
        // Flat, and said out loud rather than left to the default: it is the
        // path on which `getColor` multiplies the model's texture instead of
        // replacing everything with one colour.
        _lighting: 'flat',
        // The models are metres, built at the size a train is when the camera
        // is close. Below the `W = 4` floor this is 1 and the train is a fixed
        // real-world object; above it the train holds its size on screen.
        sizeScale: W / MODEL_W,
        getPosition: (d) => d.position,
        getOrientation: (d) => d.orientation,
        getColor: (d) => d.color,
      }),
  )
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
