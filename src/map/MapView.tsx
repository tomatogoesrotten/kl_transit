import { useEffect, useRef } from 'react'
import { Map, NavigationControl } from 'maplibre-gl'
import { MapLibreOverlay } from '@deck.gl/maplibre'
import { network, prepare } from '../sim'
import { labelLayerId, networkLayers } from './layers'

// The OpenFreeMap "liberty" style already ships a `building-3d` fill-extrusion
// layer (minzoom 14), so there is nothing for us to add — just zoom in past 14.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

// Interleaved rendering shares MapLibre's own context, which is WebGL2 only.
const hasWebGL2 = document.createElement('canvas').getContext('webgl2') !== null

const rail = prepare(network)

export function MapView() {
  const container = useRef<HTMLDivElement>(null)
  // A ref, not state: Milestone 4 drives this from requestAnimationFrame, and a
  // re-render sixty times a second is exactly what we are avoiding.
  const overlay = useRef<MapLibreOverlay | null>(null)

  useEffect(() => {
    const map = new Map({
      container: container.current!,
      style: STYLE_URL,
      center: [101.699, 3.146],
      zoom: 12.5,
      pitch: 55,
      bearing: -18,
    })
    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right')

    if (hasWebGL2) {
      map.on('load', () => {
        const beforeId = labelLayerId(map.getStyle().layers)
        if (!beforeId) {
          console.error(
            'No label layer in this map style. Leaving the network undrawn rather than ' +
              'silently pasting it over the labels.',
          )
          return
        }
        const deck = new MapLibreOverlay({ interleaved: true })
        map.addControl(deck)
        deck.setProps({ layers: networkLayers(rail, beforeId) })
        overlay.current = deck
      })
    }

    return () => {
      overlay.current?.finalize()
      overlay.current = null
      map.remove()
    }
  }, [])

  return (
    <>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {!hasWebGL2 && (
        <p className="notice">
          This browser has no WebGL2, so the rail network cannot be drawn into the map. The map
          itself still works.
        </p>
      )}
    </>
  )
}
