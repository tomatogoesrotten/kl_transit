import { useEffect, useRef, useState } from 'react'
import { Map, NavigationControl } from 'maplibre-gl'
import { MapLibreOverlay } from '@deck.gl/maplibre'
import { activeTrains, klNow, network, prepare, setTimeOfDay } from '../sim'
import type { DayType } from '../sim'
import { labelLayerId, lineLayer, stationDots, stationLayer } from './layers'
import type { StationDot } from './layers'
import {
  busyStations,
  halfWidth,
  lineColors,
  stationIndex,
  trainInstances,
  trainLayers,
} from './trains'
import { FOOTPRINT_LAYER, layerOps, WIREFRAME } from './modes'
import type { MapMode } from './modes'
import { ModeSwitch } from '../ui/ModeSwitch'

// The OpenFreeMap "liberty" style already ships a `building-3d` fill-extrusion
// layer (minzoom 14), so there is nothing for us to add — just zoom in past 14.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

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

const rail = prepare(network)
// Parsed once, not once per train per frame.
const COLORS = lineColors(rail)

/**
 * TEMPORARY, and only so this milestone can be looked at: `?t=08:30` starts the
 * simulated clock at that time in Kuala Lumpur, because at a real KL 03:00 there
 * is nothing running and an empty map proves nothing.
 *
 * Milestone 5 replaces it with real time controls. To remove it before then,
 * delete this constant and the `??` that uses it in the clock below. It is
 * deliberately not UI.
 */
const FORCED_START = (() => {
  const m = /^(\d\d):(\d\d)$/.exec(new URLSearchParams(location.search).get('t') ?? '')
  return m ? setTimeOfDay(Date.now(), Number(m[1]) * 3600 + Number(m[2]) * 60) : null
})()

/**
 * The layers that never change, and what the frame loop needs to keep the
 * station markers up to date.
 *
 * Built once, on the map's load. `stationDots` walks 187 stops calling
 * `pointAt`, and the path layer re-tessellates thousands of vertices whenever
 * its data changes — neither belongs in a loop that runs sixty times a second.
 * Handing deck.gl the *same* layer instance again is how it is told nothing
 * about that layer has changed.
 */
interface Statics {
  beforeId: string
  lines: ReturnType<typeof lineLayer>
  dots: StationDot[]
  // `ReturnType`, not `Map<string, number>`: MapLibre's `Map` is imported above
  // and shadows the built-in one for the whole module.
  index: ReturnType<typeof stationIndex>
  stations: ReturnType<typeof stationLayer>
  busyVersion: number
}

export function MapView() {
  const container = useRef<HTMLDivElement>(null)
  // A ref, not state: the animation loop drives this, and a re-render sixty
  // times a second is exactly what we are avoiding.
  const overlay = useRef<MapLibreOverlay | null>(null)
  const map = useRef<Map | null>(null)
  const statics = useRef<Statics | null>(null)
  const frame = useRef(0)
  /**
   * Simulated time. A ref in `src/map` and not a module in `src/sim`, because
   * `src/sim/purity.test.ts` fails the build on mutable state or `Date.now()`
   * there. For now it simply runs at real speed; Milestone 5 adds pause, speed
   * and a day-type override, which is what `override` is already here for.
   */
  const clock = useRef({ ms: FORCED_START ?? Date.now(), override: 'auto' as DayType | 'auto' })
  // The style's own layers, captured before deck.gl adds anything of its own.
  // Two reasons, both load-bearing: switching modes must never touch the
  // network's layers, and each entry still carries the paint liberty shipped,
  // which is what returning to the city view writes back.
  const styleLayers = useRef<ReturnType<Map['getStyle']>['layers']>([])
  const [styleLoaded, setStyleLoaded] = useState(false)
  const [mode, setMode] = useState<MapMode>(readMode)

  useEffect(() => {
    const m = new Map({
      container: container.current!,
      style: STYLE_URL,
      center: [101.699, 3.146],
      zoom: 12.5,
      pitch: 55,
      bearing: -18,
    })
    map.current = m
    m.addControl(new NavigationControl({ visualizePitch: true }), 'top-right')

    // A map that fails quietly is how this project shipped three milestones on
    // top of a base map that never drew a single tile. Say something.
    m.on('error', (e) => console.error('maplibre error:', e.error ?? e))

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
          })
          m.addControl(deck)
          const dots = stationDots(rail)
          statics.current = {
            beforeId,
            lines: lineLayer(rail, beforeId),
            dots,
            index: stationIndex(dots),
            stations: stationLayer(dots, beforeId, 0),
            busyVersion: 0,
          }
          overlay.current = deck
        }
      }

      setStyleLoaded(true)
    })

    // The frame loop. It starts now and does nothing until the overlay exists —
    // which is also what happens for good when there is no WebGL2, or when the
    // style had no label layer to anchor the overlay to.
    let last = performance.now()
    const tick = (now: number) => {
      // Re-armed first, so a throw below costs one frame rather than the whole
      // animation.
      frame.current = requestAnimationFrame(tick)

      // Clamped: a tab that has been in the background for thirty seconds comes
      // back with a thirty-second delta, and advancing the timetable by that in
      // one step teleports every train.
      const dt = Math.min(250, now - last)
      last = now
      clock.current.ms += dt

      const deck = overlay.current
      const s = statics.current
      if (!deck || !s) return

      const t = klNow(clock.current.ms, clock.current.override)
      const trains = activeTrains(rail, t.sec, t.today, t.yesterday)
      // A train's size follows the camera, so both are read fresh each frame.
      const W = halfWidth(m.getZoom(), m.getCenter().lat)

      // Stations fill while a train stands at them. `dots` is one array mutated
      // in place, so the layer is rebuilt with a new trigger only when the set
      // actually changed — most frames it has not.
      const busy = busyStations(trains, s.index)
      let changed = false
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

      // Straight to deck.gl, never through React state. The two static layers go
      // back as the same instances; only the trains are new.
      deck.setProps({
        layers: [
          s.lines,
          s.stations,
          ...trainLayers(trainInstances(trains, W, COLORS), W, s.beforeId),
        ],
      })
    }
    frame.current = requestAnimationFrame(tick)

    return () => {
      // In the same cleanup as the map, or React's development double-mount
      // leaves two loops racing on one overlay.
      cancelAnimationFrame(frame.current)
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
      {!hasWebGL2 && (
        <p className="notice">
          This browser has no WebGL2, so the rail network cannot be drawn into the map. The map
          itself still works.
        </p>
      )}
    </>
  )
}
