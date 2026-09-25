// `?url`, not a JSON import: Vite emits the file as a content-hashed asset and
// hands back its address, so 230 KB of stops stay out of the main bundle and
// are fetched only when somebody opens the bus view. A plain import would put
// them in front of every first paint, rail view or not. See design.md,
// "Loading: `?url` and `fetch`".
import stopsUrl from '../../data/bus-stops.json?url'
// The same, for the route shapes: 515 KB raw, fetched in the background once
// the map has drawn, so first paint never waits for them.
import shapesUrl from '../../data/bus-shapes.json?url'
import { preparePath } from '../sim/prepare'
import type { LonLat, Origin, Path } from '../sim/types'
import { useLive } from '../ui/store'

/** One stop as `scripts/build_bus_json.py` writes it: id, name as published, lon, lat. */
export type BusStop = readonly [id: string, name: string, lon: number, lat: number]

/**
 * Fetches the bus stops, once. Called every frame while the bus view is shown,
 * so it must cost nothing after the first call: anything but `idle` returns at
 * once. A failure is final for the visit and is said in the lines panel; no
 * stops does not stop anything else working.
 */
export async function loadStops(): Promise<void> {
  if (useLive.getState().stops.state !== 'idle') return
  useLive.setState({ stops: { state: 'loading', data: null } })
  try {
    const res = await fetch(stopsUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data: unknown = await res.json()
    if (!Array.isArray(data)) throw new Error('not a list of stops')
    useLive.setState({ stops: { state: 'ready', data: data as BusStop[] } })
  } catch (e) {
    console.error('bus stops could not be loaded:', e)
    useLive.setState({ stops: { state: 'failed', data: null } })
  }
}

/** One bus route shape, prepared for `pointAt`, with its lon/lat kept for drawing it. */
export interface BusShape extends Path {
  id: string
  path: readonly LonLat[]
}

/** What `estimate.ts` needs: every shape, and which shape each published trip runs on. */
export interface BusShapes {
  shapes: ReadonlyMap<string, BusShape>
  /** Trip id to shape id, from the published trips. Never read off the trip id's spelling. */
  trips: ReadonlyMap<string, string>
}

/** `data/bus-shapes.json` as `scripts/build_bus_json.py` writes it. */
interface ShapesFile {
  origin: Origin
  shapes: Record<string, LonLat[]>
  /** trip id -> [route id, shape id] */
  trips: Record<string, [string, string]>
}

/**
 * The shapes file, prepared: each shape into metres along it in the network's
 * flat projection (`origin` is the same as network.json's, which bus.test.ts
 * pins), and the trip table indexed. Throws on a body that is not that file.
 */
export function prepareShapes(file: unknown): BusShapes {
  const f = file as ShapesFile
  if (!f || typeof f !== 'object' || !f.origin || !f.shapes || !f.trips) {
    throw new Error('not a bus shapes file')
  }
  const shapes = new Map<string, BusShape>()
  for (const [id, path] of Object.entries(f.shapes)) {
    // A shape under two points has no direction and no length; the refresh's
    // checks refuse such a file, so this is only a second guard.
    if (path.length < 2) continue
    shapes.set(id, { id, path, ...preparePath(path, f.origin) })
  }
  const trips = new Map<string, string>()
  for (const [trip, [, shape]] of Object.entries(f.trips)) if (shapes.has(shape)) trips.set(trip, shape)
  return { shapes, trips }
}

/**
 * Fetches the route shapes, once. The frame loop calls it every frame once the
 * map has first gone idle while buses are on, so anything but `idle` returns at
 * once. A failure is final for the visit: buses stay at their reports, and the
 * lines panel says estimated movement is unavailable.
 */
export async function loadShapes(): Promise<void> {
  if (useLive.getState().shapes.state !== 'idle') return
  useLive.setState({ shapes: { state: 'loading', data: null } })
  try {
    const res = await fetch(shapesUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    useLive.setState({ shapes: { state: 'ready', data: prepareShapes(await res.json()) } })
  } catch (e) {
    console.error('bus route shapes could not be loaded:', e)
    useLive.setState({ shapes: { state: 'failed', data: null } })
  }
}
