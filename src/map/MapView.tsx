import { useEffect, useRef, useState } from 'react'
import { Map, NavigationControl } from 'maplibre-gl'
import { MapLibreOverlay } from '@deck.gl/maplibre'
import { network, prepare } from '../sim'
import { labelLayerId, networkLayers } from './layers'
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

export function MapView() {
  const container = useRef<HTMLDivElement>(null)
  // A ref, not state: Milestone 4 drives this from requestAnimationFrame, and a
  // re-render sixty times a second is exactly what we are avoiding.
  const overlay = useRef<MapLibreOverlay | null>(null)
  const map = useRef<Map | null>(null)
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
          const deck = new MapLibreOverlay({ interleaved: true })
          m.addControl(deck)
          deck.setProps({ layers: networkLayers(rail, beforeId) })
          overlay.current = deck
        }
      }

      setStyleLoaded(true)
    })

    return () => {
      overlay.current?.finalize()
      overlay.current = null
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
