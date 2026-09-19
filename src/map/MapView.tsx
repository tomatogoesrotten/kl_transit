import { useEffect, useRef } from 'react'
import { Map, NavigationControl } from 'maplibre-gl'

// The OpenFreeMap "liberty" style already ships a `building-3d` fill-extrusion
// layer (minzoom 14), so there is nothing for us to add — just zoom in past 14.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

export function MapView() {
  const container = useRef<HTMLDivElement>(null)

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
    return () => map.remove()
  }, [])

  return <div ref={container} style={{ position: 'absolute', inset: 0 }} />
}
