import { useEffect, useRef, useState } from 'react'
import { Map, NavigationControl } from 'maplibre-gl'
import { MapLibreOverlay } from '@deck.gl/maplibre'
import { network, prepare } from '../sim'
import { labelLayerId, networkLayers } from './layers'
import { GROUND_LAYER, layerVisibility } from './modes'
import type { MapMode } from './modes'
import { ModeSwitch } from '../ui/ModeSwitch'

// The OpenFreeMap "liberty" style already ships a `building-3d` fill-extrusion
// layer (minzoom 14), so there is nothing for us to add — just zoom in past 14.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

// Near-black with a blue cast. Dark enough that eight line colours carry against
// it, not so flat that an empty map looks like a failed one.
const SKELETON_GROUND = '#0b0f14'

const MODE_KEY = 'kl-rail.map-mode'

/** City by default: the first question a newcomer has is "where is this". */
function readMode(): MapMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'skeleton' ? 'skeleton' : 'city'
  } catch {
    // A private window or blocked site data. The map works, it just forgets.
    return 'city'
  }
}

/** Named so its return type can be stored without spelling out the style spec. */
function groundColor(m: Map) {
  return m.getPaintProperty(GROUND_LAYER, 'background-color')
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
  // The style's own layers and ground colour, captured before deck.gl adds
  // anything, so switching modes can never touch the network's own layers and
  // city mode restores the exact colour liberty shipped.
  const styleLayers = useRef<ReturnType<Map['getStyle']>['layers']>([])
  const cityGround = useRef<ReturnType<typeof groundColor>>(undefined)
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
      styleLayers.current = m.getStyle().layers
      if (m.getLayer(GROUND_LAYER)) cityGround.current = groundColor(m)

      if (hasWebGL2) {
        const beforeId = labelLayerId(styleLayers.current)
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

  // Hiding layers rather than calling `map.setStyle` with a bare style: setStyle
  // rebuilds the whole style, which destroys the layer the deck.gl overlay
  // targets with `beforeId`. Hidden layers stay in place, so the overlay never
  // learns the mode changed — and the camera is untouched for free.
  useEffect(() => {
    const m = map.current
    if (!m || !styleLoaded) return
    for (const { id, visibility } of layerVisibility(styleLayers.current, mode)) {
      m.setLayoutProperty(id, 'visibility', visibility)
    }
    if (m.getLayer(GROUND_LAYER)) {
      m.setPaintProperty(
        GROUND_LAYER,
        'background-color',
        mode === 'skeleton' ? SKELETON_GROUND : cityGround.current,
      )
    }
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
