// `?url`, not a JSON import: Vite emits the file as a content-hashed asset and
// hands back its address, so 230 KB of stops stay out of the main bundle and
// are fetched only when somebody opens the bus view. A plain import would put
// them in front of every first paint, rail view or not. See design.md,
// "Loading: `?url` and `fetch`".
import stopsUrl from '../../data/bus-stops.json?url'
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
