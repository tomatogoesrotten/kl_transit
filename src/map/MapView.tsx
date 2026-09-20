import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { AttributionControl, Map, NavigationControl, setWorkerUrl } from 'maplibre-gl'
// MapLibre picks its worker file by name at runtime - it chooses between the
// production and development builds - so the name never appears as something a
// bundler can follow, and Vite emits nothing. The browser then asks for
// /assets/maplibre-gl-worker.mjs, which is not there, and the request hangs.
//
// MapLibre parses every vector tile in that worker, so without it the map paints
// the style's background colour and stops. It looks exactly like a broken map,
// with no error anywhere: the style, the sprite and the tile index all load
// fine. This is the same failure the dev server had, arriving by another route -
// `optimizeDeps.exclude` fixed it there by keeping MapLibre where its worker
// sits, which is why the production build was the first place it showed.
//
// `?worker&url` makes Vite bundle the worker properly (it imports from a shared
// chunk, so copying the file alone would not work) and hand back the hashed URL.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { AddLayerObject, PaddingOptions } from 'maplibre-gl'
import { MapLibreOverlay } from '@deck.gl/maplibre'
import { activeTrains, klNow, network, prepare } from '../sim'
import type { ActiveTrain, KlTime } from '../sim'
import { arrivalZoom, panelPadding } from './camera'
import { cameraLayers, labelLayerId, lineLayer, stationLayer } from './layers'
import type { StationDot } from './layers'
import { sharedCorridors } from './offset'
import { stationBuildingLayers } from './stationBuildings'
import {
  busyStations,
  halfWidth,
  lineColors,
  stationIndex,
  trainInstances,
  trainLayers,
} from './trains'
import type { TrainInstance } from './trains'
import { FOOTPRINT_LAYER, layerOps, WIREFRAME } from './modes'
import type { MapMode } from './modes'
import { ModeSwitch } from '../ui/ModeSwitch'
import { distinctSelections, findTrain, trainSelection } from '../ui/inspect'
import { paintCard, paintCounts, paintReadout, panels, showTip } from '../ui/readout'
import type { Selection } from '../ui/store'
import { setMs, useClock, useView } from '../ui/store'

// The OpenFreeMap "liberty" style already ships a `building-3d` fill-extrusion
// layer (minzoom 14), so there is nothing for us to add — just zoom in past 14.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

setWorkerUrl(maplibreWorkerUrl)

const MODE_KEY = 'kl-rail.map-mode'

/**
 * City by default: the first question a newcomer has is "where is this".
 *
 * Anything but the exact string falls back to city, which is also how an older
 * stored value — this used to be `skeleton` — retires without an error.
 */
function readMode(): MapMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'wireframe' ? 'wireframe' : 'city'
  } catch {
    // A private window or blocked site data. The map works, it just forgets.
    return 'city'
  }
}

function saveMode(mode: MapMode) {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // Same again: not remembering is not a failure worth showing anybody.
  }
}

// Interleaved rendering shares MapLibre's own context, which is WebGL2 only.
const hasWebGL2 = document.createElement('canvas').getContext('webgl2') !== null

/**
 * Both read once, at load: each is a question about the device and the person
 * using it, not about any one event, and matchMedia is not free.
 *
 * A fingertip is not a mouse cursor — it covers a good deal more than eight
 * pixels of track — so a coarse pointer gets a wider hit radius. And an
 * animated camera flight across the city is exactly the motion that
 * `prefers-reduced-motion` exists to ask for less of.
 */
const COARSE_POINTER = window.matchMedia?.('(pointer: coarse)').matches ?? false
const REDUCED_MOTION = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * Picking radius in pixels. The default is zero, which is an exact pixel hit.
 *
 * This, and not the size of the station models, is what makes a station easy to
 * click. The two were briefly the same lever and it was the wrong one: growing
 * the models until they were comfortable to hit made the city centre a pile of
 * furniture. A tolerance costs nothing on screen.
 */
const PICK_RADIUS = COARSE_POINTER ? 18 : 12

/**
 * How many things one click may offer between.
 *
 * Four tracks share the corridor at its busiest, and a train standing at a
 * platform covers its own station marker and the station model around it.
 * Titiwangsa alone is four rings plus one model, so this has to leave room for
 * a train behind them — the depth is what stops the trains being cut off the
 * end of a crowded pick.
 */
const PICK_DEPTH = 8

const rail = prepare(network)
// Parsed once, not once per train per frame.
const COLORS = lineColors(rail)
// Ampang and Sri Petaling share their last 8.5 km, so they cannot both be drawn
// on it. Found in the data rather than listed here: see `sharedCorridors`.
const CORRIDORS = sharedCorridors(rail)

/**
 * The layers that never change, and what the frame loop needs to keep the
 * station markers up to date.
 *
 * Built once, on the map's load. `stationDots` walks 187 stops calling
 * `pointAt`, and the path layer re-tessellates thousands of vertices whenever
 * its data changes — neither belongs in a loop that runs sixty times a second.
 * Handing deck.gl the *same* layer instance again is how it is told nothing
 * about that layer has changed.
 *
 * `camera` is the exception, and the reason it is a function: the lines that
 * share an alignment are separated by a fixed number of PIXELS, so their
 * geometry and the markers on it have to be rebuilt when the zoom changes. It
 * returns the same objects until that happens.
 */
interface Statics {
  beforeId: string
  lines: ReturnType<typeof lineLayer>
  camera: ReturnType<typeof cameraLayers>
  dots: StationDot[]
  // `ReturnType`, not `Map<string, number>`: MapLibre's `Map` is imported above
  // and shadows the built-in one for the whole module.
  index: ReturnType<typeof stationIndex>
  stations: ReturnType<typeof stationLayer>
  busyVersion: number
  /** The hidden set the layers above were built from. Compared by identity. */
  hidden: ReadonlySet<string>
}

/**
 * How much of the gap to the followed train the camera closes each frame.
 *
 * A jump, never `easeTo`: an animation started on every frame is cancelled by
 * the next one, so it never completes and it emits a movestart/moveend pair
 * sixty times a second. The smoothing is ours, and it is this one line.
 */
const FOLLOW_MS = 220

/** What the pick handlers need from the frame loop. They fire between frames, never inside one. */
interface Frame {
  trains: readonly ActiveTrain[]
  t: KlTime
  ms: number
}

/** What is under the pointer, in a few words, or null when it is empty map. */
function hoverText(layerId: string | undefined, object: unknown, now: Frame | null): string | null {
  if (!object || !layerId || !now) return null
  if (layerId === 'stations') return rail.stations[(object as StationDot).id]?.name ?? null
  if (!layerId.startsWith('trains-')) return null
  // By id, against this frame's own trains: the instance carries an identity
  // and nothing else, so that the renderer holds no references to the
  // simulation's records.
  const train = now.trains.find((tr) => tr.id === (object as TrainInstance).id)
  return train ? `${train.line.code} to ${train.dir.to}` : null
}

/**
 * What one pick means, as selections. Empty for anything that is not a train
 * or a station, and an empty click dismisses the card.
 *
 * A list rather than one selection, because one click can land on several
 * things: two directions run a few pixels apart, four tracks share the busiest
 * corridor, and a train standing at a platform covers its own ring.
 */
function pickToSelection(layerId: string | undefined, object: unknown, now: Frame): Selection[] {
  if (!object || !layerId) return []
  if (layerId === 'stations') {
    const dot = object as StationDot
    return [{ kind: 'station', lineId: dot.line, stopId: dot.id }]
  }
  if (!layerId.startsWith('trains-')) return []
  const train = now.trains.find((tr) => tr.id === (object as TrainInstance).id)
  return train ? [trainSelection(train, now.t, now.ms)] : []
}

/** The drawn instance for a train id, or undefined. Not the simulated position — see below. */
function instanceOf(
  byMode: Record<string, TrainInstance[]>,
  id: string,
): TrainInstance | undefined {
  for (const list of Object.values(byMode)) {
    const hit = list.find((instance) => instance.id === id)
    if (hit) return hit
  }
  return undefined
}

/**
 * @param panels The bottom-left column of panels, so the camera can be told how
 *   much of the viewport they cover. Passed in rather than found by class name:
 *   App owns that element, and a `querySelector` here would be a silent
 *   dependency on its markup.
 */
export function MapView({ panels: column }: { panels: RefObject<HTMLDivElement | null> }) {
  const container = useRef<HTMLDivElement>(null)
  // A ref, not state: the animation loop drives this, and a re-render sixty
  // times a second is exactly what we are avoiding.
  const overlay = useRef<MapLibreOverlay | null>(null)
  const map = useRef<Map | null>(null)
  const statics = useRef<Statics | null>(null)
  const frame = useRef(0)
  // The style's own layers, captured before deck.gl adds anything of its own.
  // Two reasons, both load-bearing: switching modes must never touch the
  // network's layers, and each entry still carries the paint liberty shipped,
  // which is what returning to the city view writes back.
  const styleLayers = useRef<ReturnType<Map['getStyle']>['layers']>([])
  const [styleLoaded, setStyleLoaded] = useState(false)
  const [mode, setMode] = useState<MapMode>(readMode)
  // What the frame loop last computed, for the pick handlers to read. They fire
  // between frames, so they cannot recompute any of it themselves without
  // disagreeing with what is on the screen.
  const latest = useRef<{ trains: readonly ActiveTrain[]; t: KlTime; ms: number } | null>(null)
  // Hover is for pointers that hover. Without this a tap flashes a description
  // before the card opens, because a browser sends a mousemove before a click.
  const coarse = useRef(false)
  // The last camera padding applied, so a one-shot move to a station is framed
  // in the same visible box the follow camera centres in.
  const padding = useRef<PaddingOptions>({ top: 0, right: 0, bottom: 0, left: 0 })
  // Which pointers are currently down on the map. Read by the frame loop, so a
  // ref rather than state: it changes on every press and must not re-render.
  //
  // A set rather than a flag, because touch rotation uses two fingers: with a
  // flag, the first finger lifting clears it while the second is still down, the
  // camera resumes mid-gesture, and the twist dies. A set also survives a
  // pointer whose release is never delivered, since the id simply never returns.
  const steering = useRef(new Set<number>())

  useEffect(() => {
    const m = new Map({
      container: container.current!,
      style: STYLE_URL,
      center: [101.699, 3.146],
      zoom: 12.5,
      pitch: 55,
      bearing: -18,
      // MapLibre's default attribution renders in full, wraps to two lines and
      // grows taller than the gap the time bar leaves it, so it sits on top of
      // the controls. Compact is the same credit behind an information mark —
      // the licence requires attribution, not that it never collapse.
      attributionControl: false,
    })
    map.current = m
    m.addControl(new AttributionControl({ compact: true }), 'bottom-right')
    m.addControl(new NavigationControl({ visualizePitch: true }), 'top-right')

    // A map that fails quietly is how this project shipped three milestones on
    // top of a base map that never drew a single tile. Say something.
    m.on('error', (e) => console.error('maplibre error:', e.error ?? e))

    // The panels along the bottom cover part of the map, so the camera is told
    // to treat only the rest of the viewport as visible. Without this, centring
    // a followed train centres it BEHIND the panels on a phone, which is the
    // one place following matters most.
    //
    // Measured rather than assumed, because the height genuinely moves: the
    // time bar wraps at narrow widths, the no-trains notice adds a whole row,
    // and at phone width the card joins the same column. A ResizeObserver is
    // the browser telling us when that happened; nothing here runs per frame.
    const applyPadding = () => {
      const height = m.getContainer().clientHeight
      const top = column.current?.getBoundingClientRect().top ?? height
      padding.current = {
        top: 0,
        right: 0,
        bottom: panelPadding(height, height - top),
        left: 0,
      }
      m.setPadding(padding.current)
    }
    const sizes = new ResizeObserver(applyPadding)
    if (column.current) sizes.observe(column.current)
    // The observer only watches the column. Turning the phone changes how much
    // of the viewport that same column covers, so the map's own resize counts.
    m.on('resize', applyPadding)
    applyPadding()

    // The lines panel asking the map to go and look at a station. One
    // deliberate move, so it is animated — unlike the follow camera, which
    // jumps every frame precisely because a per-frame animation cancels itself.
    const offGoTo = useView.subscribe((state, prev) => {
      if (state.goTo === prev.goTo || !state.goTo) return
      const s = statics.current
      const i = s?.index.get(state.goTo.stopId)
      // No overlay means no station markers to go to either — see hasWebGL2.
      if (!s || i === undefined) return
      const dot = s.dots[i]
      const to = {
        // The DRAWN position: the feed's own coordinates sit up to 105 m off
        // the rails, so a station is on the track, not beside it.
        center: [dot.position[0], dot.position[1]] as [number, number],
        zoom: arrivalZoom(m.getZoom()),
        padding: padding.current,
      }
      if (REDUCED_MOTION) m.jumpTo(to)
      else m.easeTo(to)
    })

    // Taking the map back stops the camera following a train. `dragstart` is
    // the signal because MapLibre only fires it for a real interaction and
    // applies its own click-versus-drag threshold. NOT `move` or `moveend`:
    // this app's own `jumpTo` fires those sixty times a second while
    // following, so listening to them would cancel on the first frame. Zoom is
    // deliberately not here — changing how close you are is not taking the map
    // back.
    m.on('dragstart', () => useView.getState().stopFollowing())

    // Rotating and tilting are NOT taking the map back, so they must not stop
    // following — and MapLibre fires `rotatestart`/`pitchstart` for those, never
    // `dragstart`, so nothing above cancels them.
    //
    // They were still impossible, for a reason that is not in the event names.
    // `jumpTo` calls `stop()`, and MapLibre's `_stop` ends with
    // `return e || this._stopHandlers(), this` — with no argument that is
    // falsy, so it aborts whatever gesture is in progress. The follow camera
    // calls `jumpTo` sixty times a second, so it killed the drag before it could
    // become anything.
    //
    // Listening for `rotatestart` cannot fix that: it is a race between our
    // frame and MapLibre's, and the gesture loses it. So this watches the
    // pointer instead, which is known before MapLibre has processed anything: if
    // a button or finger is down on the map, the camera does not write. The
    // train drifts off centre during the drag and glides back on release, which
    // is right — it is the viewer's gesture, and the camera should not argue
    // with it mid-drag.
    //
    // `pointerup` and `pointercancel` are on the window, not the canvas, so a
    // release outside the map still clears it rather than sticking on.

    // Which kind of pointer is in use, for the hover suppression above. Removed
    // in the cleanup, or React's development double-mount leaves two behind.
    const notePointer = (e: PointerEvent) => {
      coarse.current = e.pointerType !== 'mouse'
      steering.current.add(e.pointerId)
    }
    const releasePointer = (e: PointerEvent) => {
      steering.current.delete(e.pointerId)
    }
    m.getContainer().addEventListener('pointerdown', notePointer)
    window.addEventListener('pointerup', releasePointer)
    window.addEventListener('pointercancel', releasePointer)

    // MapLibre already gives its canvas tabindex="0" and its own keyboard
    // handler, so arrow keys pan and +/- zoom once it has focus. All this does
    // is say so, where the prototype promised it and implemented nothing.
    m.getCanvas().setAttribute(
      'aria-label',
      'Map of Klang Valley rail lines with trains placed by the timetable. ' +
        'Arrow keys move the view, plus and minus zoom. ' +
        'Stations can be selected from the lines panel.',
    )

    m.on('load', () => {
      // Before addControl. deck.gl's interleaved overlay inserts its layers into
      // the style, and a snapshot taken after would hand the wireframe the very
      // network it exists to show.
      styleLayers.current = m.getStyle().layers
      const beforeId = labelLayerId(styleLayers.current)

      // The one layer this app contributes to the base map, and it exists only
      // because MapLibre's fill-extrusion has no outline property: extruded
      // buildings cannot be stroked, so the wireframe draws their footprints as
      // ordinary lines underneath the translucent volumes. Added once, here, and
      // switched on and off below — not added and removed on every toggle.
      m.addLayer(
        {
          id: FOOTPRINT_LAYER,
          type: 'line',
          source: 'openmaptiles',
          'source-layer': 'building',
          minzoom: 13,
          layout: { visibility: 'none' },
          paint: {
            'line-color': WIREFRAME.footprint,
            'line-width': WIREFRAME.footprintWidth,
          },
        },
        beforeId,
      )

      // The stations, drawn as the city's own buildings in the line's colour.
      // No geometry of ours: these colour the OpenStreetMap buildings that are
      // already on the map, so a station is the building that is really there.
      //
      // After the style's own building layer, which is what makes the tint the
      // one that shows — see `stationBuildingLayers`. Before `beforeId`, so the
      // labels still read over the top.
      //
      // Deliberately NOT part of the mode snapshot taken above, so `layerOps`
      // never touches them and they stay lit in both modes. In the wireframe
      // that is the point: every other building drops to a translucent ghost
      // and the station buildings are left as the solid, coloured things in it,
      // which is the same order of brightness the rest of the wireframe keeps.
      //
      // `AddLayerObject` types every paint property exactly, and the height and
      // base in these are copied from whatever the style shipped, so the call
      // is widened once here rather than the values being cast one by one.
      for (const layer of stationBuildingLayers(rail, styleLayers.current)) {
        m.addLayer(layer as AddLayerObject, beforeId)
      }

      if (hasWebGL2) {
        if (!beforeId) {
          console.error(
            'No label layer in this map style. Leaving the network undrawn rather than ' +
              'silently pasting it over the labels.',
          )
        } else {
          // The train models are fetched, so this is the one place a failure
          // would otherwise be silent: a missing or malformed .gltf would just
          // mean no trains, which looks exactly like a quiet night.
          const deck = new MapLibreOverlay({
            interleaved: true,
            onError: (e) => console.error('deck.gl error:', e),
            // Both of these are properties of the RENDERER, not of a layer.
            //
            // The cursor is not polish. In interleaved mode deck.gl draws onto
            // MapLibre's own canvas, and its default cursor function writes
            // `grab` there on every frame — so MapLibre's pointer and grabbing
            // states never appear and the map feels broken for a reason nobody
            // would guess. Saying it explicitly hands the pointer back.
            getCursor: ({ isHovering }) => (isHovering ? 'pointer' : 'grab'),
            // And the radius defaults to zero, which is an exact pixel hit. A
            // train three kilometres away is a few pixels across; without a
            // radius it is uncatchable. Wider again for a fingertip.
            pickingRadius: PICK_RADIUS,
            onHover: (info) => {
              if (coarse.current) return showTip(null, 0, 0)
              showTip(hoverText(info.layer?.id, info.object, latest.current), info.x, info.y)
            },
            onClick: (info) => {
              const now = latest.current
              if (!now) return
              showTip(null, 0, 0)
              // Every candidate under the click, not just the topmost one.
              //
              // `pickMultipleObjects` is marked "@deprecated WebGL only. Use
              // `pickObjectsAsync` instead" in @deck.gl/core — but the overlay
              // forwards only `pickObject`, `pickMultipleObjects` and
              // `pickObjects` (see @deck.gl/maplibre's overlay.d.ts), so
              // `pickObjectsAsync` is not reachable from here. This is the
              // method that exists. Do not "modernise" it into one that does
              // not, and check overlay.d.ts before believing otherwise.
              const found = distinctSelections(
                deck
                  .pickMultipleObjects({
                    x: info.x,
                    y: info.y,
                    radius: PICK_RADIUS,
                    depth: PICK_DEPTH,
                  })
                  // `flatMap`, because one pick on an interchange's model is
                  // one selection per line calling there.
                  .flatMap((pick) => pickToSelection(pick.layer?.id, pick.object, now)),
              )
              const view = useView.getState()
              // Two directions run a few pixels apart by design, and four
              // tracks share the corridor. A wider radius alone would only pick
              // the topmost more often, so offer the choice instead of
              // guessing. Nothing under the click still dismisses the card.
              if (found.length > 1) view.offer(found)
              else view.select(found[0] ?? null)
            },
          })
          m.addControl(deck)
          const camera = cameraLayers(rail, CORRIDORS, beforeId)
          // From the store, not from the default: it is what the loop will
          // compare against, and starting from a different empty set would
          // rebuild every layer on the very first frame for nothing.
          const hidden = useView.getState().hidden
          const { dots } = camera(m.getZoom(), m.getCenter().lat, hidden)
          statics.current = {
            beforeId,
            lines: lineLayer(rail, CORRIDORS, beforeId, hidden),
            camera,
            dots,
            index: stationIndex(dots),
            stations: stationLayer(dots, beforeId, 0),
            busyVersion: 0,
            hidden,
          }
          overlay.current = deck
        }
      }

      setStyleLoaded(true)
    })

    // The frame loop. The clock and the readout run from the first frame; the
    // drawing below waits for the overlay, which never arrives when there is no
    // WebGL2 or when the style had no label layer to anchor it to.
    let last = performance.now()
    // The readout is painted a few times a second, not sixty. The prototype
    // gates on the SIMULATED second, which at 60× changes about sixty times a
    // real second, so real time gates it as well.
    let lastSecond = -1
    let lastPaint = 0
    let lastAny = true
    // The counts and the open card, on their own quarter-second gate. Painted
    // out of turn when the selection changes, so a freshly opened card is never
    // blank while it waits for the next one.
    let lastPanels = 0
    let lastSelection: Selection | null = null
    let lastCardOpen = false
    const tick = (now: number) => {
      // Re-armed first, so a throw below costs one frame rather than the whole
      // animation.
      frame.current = requestAnimationFrame(tick)

      // Clamped: a tab that has been in the background for thirty seconds comes
      // back with a thirty-second delta, and advancing the timetable by that in
      // one step teleports every train. At 60× a clamped frame is still fifteen
      // simulated seconds, so a backgrounded tab at 60× falls behind — which is
      // the better half of the trade, and deliberate.
      const dt = Math.min(250, now - last)
      last = now

      // `getState()`, not a hook: this loop is created once, on mount, so any
      // React state it closed over would be frozen at mount and pressing 60×
      // would never reach it. No subscription, no dependency, no mirrored ref.
      const c = useClock.getState()
      const ms =
        c.mode === 'live' ? Date.now() : c.mode === 'running' ? c.ms + dt * c.speed : c.ms
      setMs(ms)

      const t = klNow(ms, c.override)
      const trains = activeTrains(rail, t.sec, t.today, t.yesterday)
      const any = trains.length > 0
      const view = useView.getState()
      // What the pick handlers read when the pointer moves or something is
      // clicked, so that a pick always answers about the frame on screen.
      latest.current = { trains, t, ms }
      // The one thing the loop publishes to React, and it is written only when
      // the answer changes — see the guard inside the action.
      c.setTrainsRunning(any)

      // Clock, date, timetable line and slider go straight to the DOM. Also
      // painted out of turn the moment service starts or stops, because that is
      // when React unhides the notice and an empty panel is what a broken one
      // looks like.
      const whole = Math.floor(t.sec)
      if (any !== lastAny || (whole !== lastSecond && now - lastPaint >= 200)) {
        lastAny = any
        lastSecond = whole
        lastPaint = now
        paintReadout(rail, t, any)
      }

      // Counts on every line, the network total, and the open card. Four times
      // a second: current enough to read, rare enough not to distract, and
      // never a React render — see `panels` in readout.ts.
      // The card being re-opened counts as a change too, or pressing Details on
      // the following strip shows a blank card until the next quarter-second.
      if (
        view.selection !== lastSelection ||
        view.cardOpen !== lastCardOpen ||
        now - lastPanels >= 250
      ) {
        lastSelection = view.selection
        lastCardOpen = view.cardOpen
        lastPanels = now
        paintCounts(trains)
        if (view.selection && view.cardOpen) paintCard(rail, view.selection, trains, t, ms)
      }

      const deck = overlay.current
      const s = statics.current
      if (!deck || !s) return
      // A train's size follows the camera, so both are read fresh each frame.
      const zoom = m.getZoom()
      const lat = m.getCenter().lat
      const W = halfWidth(zoom, lat)

      // Hiding a line filters the DATA, never the corridors: those are worked
      // out once from the whole network, and recomputing them from the visible
      // subset would snap 8.5 km of line sideways the moment its partner was
      // switched off — for a checkbox. So the partner of a hidden line stays
      // drawn beside an alignment it now has to itself. That is a drawing
      // convention, not a claim about where the rails are.
      const hidden = view.hidden
      if (hidden !== s.hidden) {
        s.hidden = hidden
        // The lines that share track with nobody are still rebuilt only when
        // they have to be: the zoom does not move them, but hiding one does.
        s.lines = lineLayer(rail, CORRIDORS, s.beforeId, hidden)
      }
      // Rebuilt inside only when the zoom or the hidden set changed; the same
      // objects otherwise.
      const cam = s.camera(zoom, lat, hidden)
      const shown = hidden.size === 0 ? trains : trains.filter((tr) => !hidden.has(tr.line.id))

      let changed = false
      if (cam.dots !== s.dots) {
        // Fresh markers, moved for the new zoom, and with `busy` back to false
        // on all of them — so the loop below has to write it again.
        s.dots = cam.dots
        s.index = stationIndex(cam.dots)
        changed = true
      }

      // Stations fill while a train stands at them. `dots` is one array mutated
      // in place, so the layer is rebuilt with a new trigger only when the set
      // actually changed — most frames it has not.
      const busy = busyStations(shown, s.index)
      for (let i = 0; i < s.dots.length; i++) {
        const on = busy.has(i)
        if (s.dots[i].busy !== on) {
          s.dots[i].busy = on
          changed = true
        }
      }
      if (changed) {
        s.busyVersion += 1
        s.stations = stationLayer(s.dots, s.beforeId, s.busyVersion)
      }

      // `cam.gap` rather than the gap for this frame's camera, so a train is
      // offset by exactly what its own drawn track was offset by.
      const byMode = trainInstances(shown, W, COLORS, CORRIDORS, cam.gap)

      // Following. The camera goes to the train's DRAWN position, not to the
      // one the simulation computed: a train carries its keep-left shift and
      // its share of the corridor offset, both of which depend on the camera.
      // Recomputing either here, or using another frame's `W` and `cam.gap`,
      // puts the camera metres off and drifting as the zoom changes.
      if (view.following && view.selection?.kind === 'train') {
        const train = findTrain(shown, view.selection)
        const drawn = train && instanceOf(byMode, train.id)
        if (drawn && steering.current.size === 0) {
          // A jump every frame, closing part of the gap — see FOLLOW_MS. The
          // zoom, pitch and bearing are left exactly as the viewer set them.
          const centre = m.getCenter()
          const k = Math.min(1, dt / FOLLOW_MS)
          m.jumpTo({
            center: [
              centre.lng + (drawn.position[0] - centre.lng) * k,
              centre.lat + (drawn.position[1] - centre.lat) * k,
            ],
          })
        } else if (!drawn) {
          // Its trip ended, or its line was hidden. Either way there is nothing
          // left to keep up with, and the card is re-opened to say which —
          // honestly, and because a shut card says nothing at all.
          view.followedGone()
        }
      }

      // Straight to deck.gl, never through React state. The two static layers go
      // back as the same instances; only the trains are new.
      //
      // Order is draw order: the trains go last, so a train standing at a
      // platform is drawn over its own station marker rather than under it.
      deck.setProps({
        layers: [s.lines, cam.shared, s.stations, ...trainLayers(byMode, W, s.beforeId)],
      })
    }
    frame.current = requestAnimationFrame(tick)

    return () => {
      // In the same cleanup as the map, or React's development double-mount
      // leaves two loops racing on one overlay.
      cancelAnimationFrame(frame.current)
      sizes.disconnect()
      offGoTo()
      m.getContainer().removeEventListener('pointerdown', notePointer)
      window.removeEventListener('pointerup', releasePointer)
      window.removeEventListener('pointercancel', releasePointer)
      overlay.current?.finalize()
      overlay.current = null
      statics.current = null
      map.current = null
      // So a remount (React's StrictMode does one in development) re-applies the
      // mode to the new map rather than assuming the old one is still there.
      setStyleLoaded(false)
      m.remove()
    }
  }, [])

  // Repainting layers rather than calling `map.setStyle` with a second style:
  // setStyle rebuilds everything, which destroys the layer the deck.gl overlay
  // targets with `beforeId`. Repainted layers stay in place, so the overlay
  // never learns the mode changed — and the camera is untouched for free.
  useEffect(() => {
    // The panels are siblings of the map and never receive the mode, but they
    // have to match it: the city map is pale and the wireframe is near-black, so
    // one panel colour cannot sit well on both. Putting it on the document root
    // lets CSS select on it — no prop-drilling, no store, and no component needs
    // to know. A third view later would be CSS alone.
    document.documentElement.dataset.mapMode = mode

    const m = map.current
    if (!m || !styleLoaded) return

    // MapLibre types `setPaintProperty` as a property name paired with that
    // property's own value type. Our ops carry pairs it cannot check together,
    // so we widen the call once, here, rather than casting at every use.
    const setPaint = m.setPaintProperty.bind(m) as (
      id: string,
      name: string,
      value: unknown,
    ) => void

    for (const { id, visibility, paint } of layerOps(styleLayers.current, mode)) {
      m.setLayoutProperty(id, 'visibility', visibility)
      for (const [name, value] of Object.entries(paint)) setPaint(id, name, value)
    }

    // Ours, so it is not in the snapshot and gets its own line.
    m.setLayoutProperty(
      FOOTPRINT_LAYER,
      'visibility',
      mode === 'wireframe' ? 'visible' : 'none',
    )
  }, [mode, styleLoaded])

  return (
    <>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      <ModeSwitch
        mode={mode}
        onChange={(next) => {
          setMode(next)
          saveMode(next)
        }}
      />
      {/* Last, so it is drawn over the panels, and written by the pick handlers
          through a ref rather than by React: hover fires on every pointer
          movement, and a setState per event re-renders the tree mid-drag. */}
      <div
        className="tip"
        hidden
        ref={(el) => {
          panels.tip = el
        }}
      />
      {!hasWebGL2 && (
        <p className="notice">
          This browser has no WebGL2, so the rail network cannot be drawn into the map. The map
          itself still works.
        </p>
      )}
    </>
  )
}
