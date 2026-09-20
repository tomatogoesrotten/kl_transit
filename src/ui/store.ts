import { create } from 'zustand'
import { setTimeOfDay } from '../sim'
import type { DayType } from '../sim'

/**
 * How the clock is behaving.
 *
 * One value, not three booleans. The prototype kept `live`, `paused` and
 * `speed` side by side, and `live` shadowed the other two: while it was set the
 * timestamp was replaced with wall time every frame, so `paused` and `speed`
 * were dead. Carried over as independent fields, `live && paused` becomes
 * representable and the loop honours one half of it while the display reports
 * the other. Here it cannot be said.
 */
export type ClockMode = 'live' | 'running' | 'paused'
export type Speed = 1 | 10 | 60

/** 07:45, the middle of the morning peak. */
export const PEAK_SEC = 7.75 * 3600

export interface ClockStore {
  mode: ClockMode
  /** Meaningless while live, and remembered across a pause. */
  speed: Speed
  override: 'auto' | DayType
  /** The simulated moment, epoch ms. Written every frame - see `setMs`. */
  ms: number
  /**
   * Whether any train is scheduled at `ms`. Published by the frame loop, and
   * only when it changes.
   */
  trainsRunning: boolean

  now: () => void
  togglePause: () => void
  setSpeed: (speed: Speed) => void
  setOverride: (override: 'auto' | DayType) => void
  scrubTo: (sec: number) => void
  jumpToPeak: () => void
  setTrainsRunning: (running: boolean) => void
}

export const useClock = create<ClockStore>()((set, get) => ({
  mode: 'live',
  speed: 1,
  override: 'auto',
  ms: Date.now(),
  // Assume service until the first frame says otherwise, so the "nothing is
  // running" notice never flashes on load.
  trainsRunning: true,

  // The only full reset. The override is the easy half to forget: leaving a
  // forced Sunday in place would make a live clock show the wrong timetable.
  // `ms` is not set here, because the loop snaps a live clock to real time.
  now: () => set({ mode: 'live', speed: 1, override: 'auto' }),

  // Play returns to `running` at the remembered speed, never to `live`. Only
  // Now goes back to live.
  togglePause: () => set({ mode: get().mode === 'paused' ? 'running' : 'paused' }),

  // Real speed IS live speed, so 1x leaves a live clock live. Every other case
  // ends up running, including 1x from paused.
  setSpeed: (speed) =>
    set(speed === 1 && get().mode === 'live' ? { speed } : { mode: 'running', speed }),

  setOverride: (override) => set({ override }),

  // `setTimeOfDay` in src/sim returns a number and mutates nothing, so dropping
  // out of live is the caller's job. Forget it and the next frame overwrites
  // the time with the real clock, which looks exactly like a dead slider.
  scrubTo: (sec) => {
    setMs(setTimeOfDay(get().ms, sec))
    // Paused stays paused: scrubbing a frozen clock is the useful behaviour.
    if (get().mode === 'live') set({ mode: 'running' })
  },

  jumpToPeak: () => {
    setMs(setTimeOfDay(get().ms, PEAK_SEC))
    // Offering to move somewhere and then leaving the clock stopped there is
    // not much of an offer.
    if (get().mode !== 'running') set({ mode: 'running' })
  },

  setTrainsRunning: (running) => {
    if (get().trainsRunning !== running) set({ trainsRunning: running })
  },
}))

/**
 * Writes the simulated moment.
 *
 * In place, deliberately: `set()` notifies every subscriber, and the frame loop
 * calls this sixty times a second. Nothing may subscribe to `ms` - the loop
 * reads it back with `getState()`, and the clock readout is written to the DOM
 * through refs. `store.test.ts` fails if this ever starts notifying.
 */
export function setMs(ms: number) {
  useClock.getState().ms = ms
}
