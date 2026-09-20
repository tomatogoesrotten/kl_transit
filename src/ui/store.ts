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
 * What a person has picked out on the map: a train, or a stop on one line.
 *
 * A train is NOT held by `ActiveTrain.id`. That string is built from the
 * service day and which departure of it this is, and both change under the very
 * same physical train: midnight rolls a departure from today's list into
 * yesterday's, and forcing a different timetable renames every train on screen.
 * Line, direction and departure second survive both, and they are unique among
 * running trains — today's pass only ever holds departures at or before now,
 * and a trip is far shorter than a day, so yesterday's only holds ones after
 * it.
 *
 * `departedMs` is the honesty half. It is the simulated moment the train left
 * its origin, which is an absolute anchor: a clock that has run past the end of
 * the trip means the trip finished, a clock scrubbed back before it means the
 * train has not left, and neither has to be guessed from a departure second
 * that repeats every service day.
 */
export interface TrainSelection {
  kind: 'train'
  lineId: string
  dir: 0 | 1
  /** The departure second within its own service day, un-shifted. */
  dep: number
  /** When it left its origin, as epoch ms on the simulated clock. */
  departedMs: number
}

export interface StationSelection {
  kind: 'station'
  lineId: string
  stopId: string
}

export type Selection = TrainSelection | StationSelection

export interface ViewStore {
  selection: Selection | null
  /**
   * Whether the card describing the selection is on screen.
   *
   * Separate from `selection` because following used to end the moment the card
   * was closed - and on a phone the card covers the very train the camera is
   * chasing, so the only way to SEE it was to stop following it. Closing the
   * card now puts the card away and leaves the selection, and the camera, alone.
   */
  cardOpen: boolean
  /** Whether the camera is keeping up with the selected train. */
  following: boolean
  /**
   * The things one click found, when it found more than one and the viewer has
   * not said which they meant. Empty the rest of the time.
   *
   * Trains keep left, so both directions of a line run a few pixels apart by
   * design; on the shared corridor there are four tracks of them. A wider hit
   * radius alone would only pick the topmost more often, which is not a choice.
   */
  choices: readonly Selection[]
  /**
   * A station the lines panel asked the map to go and look at.
   *
   * `n` counts the asks, so that choosing the same station twice is two moves
   * rather than one - the map listens for this field CHANGING.
   */
  goTo: { stopId: string; n: number } | null
  /** Line ids the viewer has switched off. Replaced, never mutated - see `toggleLine`. */
  hidden: ReadonlySet<string>

  select: (selection: Selection | null) => void
  closeCard: () => void
  showCard: () => void
  offer: (choices: readonly Selection[]) => void
  clearChoices: () => void
  goToStation: (selection: StationSelection) => void
  toggleFollow: () => void
  stopFollowing: () => void
  followedGone: () => void
  toggleLine: (lineId: string) => void
}

/**
 * Nothing to choose between. One shared instance, so "are there choices" stays
 * an identity test and a component subscribed to it is not re-rendered by every
 * ordinary click handing it a fresh empty array.
 */
const NO_CHOICES: readonly Selection[] = []

/**
 * The things a person changes about what they are looking at.
 *
 * Beside the clock rather than inside it: the clock store is documented as how
 * the clock is behaving, and a selection is not that. Both are read from the
 * frame loop with `getState()` and neither is subscribed to there.
 */
export const useView = create<ViewStore>()((set, get) => ({
  selection: null,
  cardOpen: false,
  following: false,
  choices: NO_CHOICES,
  goTo: null,
  hidden: new Set<string>(),

  // Selecting something new never inherits the last thing's follow. Following a
  // train while reading about a different one is a camera that has run away.
  // Selecting always opens the card: choosing a thing is asking about it.
  select: (selection) =>
    set({ selection, cardOpen: selection !== null, following: false, choices: NO_CHOICES }),

  // Putting the card away, which is NOT the same as deselecting. While the
  // camera is following, the selection is the train it is following and the
  // indicator says so; otherwise nothing refers to it any more, so it goes.
  closeCard: () =>
    set(get().following ? { cardOpen: false } : { cardOpen: false, selection: null }),

  showCard: () => set({ cardOpen: true }),

  offer: (choices) => set({ choices }),

  clearChoices: () => set({ choices: NO_CHOICES }),

  // The lines panel's station button. It selects the station AND asks the map
  // to go there, and it stops following: asking to look somewhere else is
  // taking the map back, the same as dragging it.
  goToStation: (selection) =>
    set({
      selection,
      cardOpen: true,
      following: false,
      choices: NO_CHOICES,
      goTo: { stopId: selection.stopId, n: (get().goTo?.n ?? 0) + 1 },
    }),

  toggleFollow: () => set({ following: !get().following }),

  // The viewer taking the map back, by dragging it or by pressing Stop. The
  // card is left exactly as they had it. It must not write when there is
  // nothing to write - see `setTrainsRunning`.
  stopFollowing: () => {
    if (get().following) set({ following: false })
  },

  // Called from the frame loop when the followed train stops being drawn: its
  // trip ended, or its line was hidden. The card comes back, because the spec
  // says the display must say the train is no longer running, and a card that
  // is shut says nothing at all.
  followedGone: () => {
    if (get().following) set({ following: false, cardOpen: true })
  },

  // A new Set every time, so `cameraLayers` can tell it changed by identity
  // alone. Hiding the line of the selected thing clears the selection rather
  // than leaving a card describing something invisible.
  toggleLine: (lineId) => {
    const hidden = new Set(get().hidden)
    if (!hidden.delete(lineId)) hidden.add(lineId)
    const selection = get().selection
    const gone = selection !== null && hidden.has(selection.lineId)
    set(
      gone
        ? { hidden, selection: null, cardOpen: false, following: false, choices: NO_CHOICES }
        : { hidden, choices: NO_CHOICES },
    )
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
