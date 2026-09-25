import { decodeFeed, due, FEED_URL, LIVE_MODES } from './feed'
import type { LiveMode } from './feed'
import { receive, useClock, useView } from '../ui/store'

/**
 * The side-effecting half of src/live: `fetch`, a timer and the page's
 * visibility. Everything it decides with is in feed.ts, which is pure and
 * tested; this is meant to be small enough to check by reading.
 */

/** How often the conditions are re-checked. Not how often anything is fetched - see `due`. */
const TICK_MS = 2_000

/** A hung connection gives up its slot after this long, and is reported as unavailable. */
const TIMEOUT_MS = 20_000

// Module state, deliberately not a component's: a remount (React's development
// double-mount included) must not be able to fetch early. `performance.now()`
// because these measure intervals, and the wall clock can be changed under us.
const last: Record<LiveMode, number> = { bus: -Infinity, ktm: -Infinity }
const inFlight: Record<LiveMode, boolean> = { bus: false, ktm: false }

async function request(mode: LiveMode) {
  inFlight[mode] = true
  last[mode] = performance.now()
  try {
    const res = await fetch(FEED_URL[mode], { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (res.status === 429) return receive(mode, 'rate-limited', Date.now())
    if (!res.ok) return receive(mode, 'unavailable', Date.now())
    const bytes = new Uint8Array(await res.arrayBuffer())
    receive(mode, decodeFeed(bytes, mode), Date.now())
  } catch {
    // Network failure, CORS refusal or timeout. A 429 sent without CORS headers
    // also arrives here, as a network failure, which is still true.
    receive(mode, 'unavailable', Date.now())
  } finally {
    inFlight[mode] = false
  }
}

function tick() {
  // Everything that can change at any moment - the tab shown, Now pressed, a
  // mode switched on - is simply re-checked, so nothing needs a listener.
  if (document.visibilityState !== 'visible') return
  if (useClock.getState().mode !== 'live') return
  const off = useView.getState().liveOff
  const now = performance.now()
  for (const mode of LIVE_MODES) {
    // One request per tick at most, so two modes coming due together are still
    // staggered: the second waits for `due` to see the first one's time.
    if (!off.has(mode) && !inFlight[mode] && due(mode, now, last)) return void request(mode)
  }
}

/** Starts polling; returns the function that stops it. Called from the map's mount effect. */
export function startPolling(): () => void {
  tick()
  const timer = setInterval(tick, TICK_MS)
  return () => clearInterval(timer)
}
