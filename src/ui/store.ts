import { create } from 'zustand'
import { setTimeOfDay } from '../sim'
import type { DayType } from '../sim'
import { dropGone, mergeFixes, NO_REJECTS } from '../live/feed'
import type { Decoded, LiveMode, LiveVehicle, Rejected } from '../live/feed'
import type { BusShapes, BusStop } from '../live/busdata'

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

/**
 * A live bus or KTM vehicle, by the feed's own vehicle id. No `lineId`: it is on
 * no rail line, so everything that reads one narrows on `kind` first.
 */
export interface VehicleSelection {
  kind: 'vehicle'
  mode: LiveMode
  id: string
}

export type Selection = TrainSelection | StationSelection | VehicleSelection

/**
 * What the map is OF: the timetabled rail network, or the live buses and their
 * stops. A whole-map choice like the map style, and remembered like it.
 */
export type TransitView = 'rail' | 'bus'

const VIEW_KEY = 'kl-rail.transit-view'

/** Rail by default. Anything but the exact string is rail, so a bad stored value retires quietly. */
function rememberedView(): TransitView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'bus' ? 'bus' : 'rail'
  } catch {
    // A private window or blocked site data, or no browser at all (the tests).
    return 'rail'
  }
}

/**
 * Puts the view on <html> as `data-transit-view`, as `MapView` does the map
 * style, so CSS can follow it without a prop. Guarded like `rememberedView`.
 */
function markView(view: TransitView) {
  try {
    document.documentElement.dataset.transitView = view
  } catch {
    // No document: the tests run in Node.
  }
}

const INITIAL_VIEW = rememberedView()
markView(INITIAL_VIEW)

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
  /** Live modes the viewer has switched off. Replaced, never mutated, like `hidden`. */
  liveOff: ReadonlySet<LiveMode>
  /**
   * Rail or bus. React state because a person changes it; the frame loop reads
   * it with `getState()` every frame, as it does `hidden`, so switching never
   * recreates the loop.
   */
  transitView: TransitView

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
  toggleLive: (mode: LiveMode) => void
  setTransitView: (view: TransitView) => void
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
  liveOff: new Set<LiveMode>(),
  transitView: INITIAL_VIEW,

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
    const gone = selection !== null && selection.kind !== 'vehicle' && hidden.has(selection.lineId)
    set(
      gone
        ? { hidden, selection: null, cardOpen: false, following: false, choices: NO_CHOICES }
        : { hidden, choices: NO_CHOICES },
    )
  },

  // The same for a live mode. Switching it off also stops its feed being
  // requested; the poller reads `liveOff` on every tick.
  toggleLive: (mode) => {
    const liveOff = new Set(get().liveOff)
    if (!liveOff.delete(mode)) liveOff.add(mode)
    const selection = get().selection
    const gone = selection?.kind === 'vehicle' && liveOff.has(selection.mode)
    set(
      gone
        ? { liveOff, selection: null, cardOpen: false, following: false, choices: NO_CHOICES }
        : { liveOff, choices: NO_CHOICES },
    )
  },

  // Only the view. The camera, the clock, the map style, the selection and
  // which lines and modes are on are all left exactly as they were: changing
  // what the map is about is not moving it.
  setTransitView: (transitView) => {
    if (get().transitView === transitView) return
    set({ transitView })
    markView(transitView)
    try {
      localStorage.setItem(VIEW_KEY, transitView)
    } catch {
      // Not remembering is not a failure worth showing anybody.
    }
  },
}))

/**
 * What a live feed is doing, said per mode.
 *
 * - `waiting`: nothing asked yet, or the first answer is not back.
 * - `ok` / `empty`: it answered, with vehicles or with none. The KTM feed
 *   alternated between nine and none in sampling, so an empty answer is not
 *   "no trains" and does not erase the ones held.
 * - `unavailable`: the request failed - network, timeout, or a non-2xx that is
 *   not a 429. A 429 without CORS headers also lands here, which is still true.
 * - `rate-limited`: the API answered 429.
 * - `unreadable`: it answered with something that is not a feed message.
 */
export interface LiveStatus {
  state: 'waiting' | 'ok' | 'empty' | 'unavailable' | 'rate-limited' | 'unreadable'
  /** When the feed last answered with something decodable, epoch ms. */
  lastOkMs: number | null
  /** The reports in the LATEST response that could not be drawn. */
  rejected: Rejected
}

export interface LiveFeed {
  /** Vehicle id to its newest usable report. Replaced, never mutated. */
  held: ReadonlyMap<string, LiveVehicle>
  /** Bumped whenever `held` is replaced, so the map can rebuild its layer on a number. */
  version: number
  status: LiveStatus
}

export type LiveFeeds = Record<LiveMode, LiveFeed>

/**
 * A static data file fetched after first paint: not asked for yet, on its way,
 * arrived, or failed. Said in the lines panel while it is not simply ready.
 */
export type LoadState = 'idle' | 'loading' | 'ready' | 'failed'

export interface LiveStore extends LiveFeeds {
  /** The bus stops, fetched the first time the bus view is shown. See `loadStops`. */
  stops: { state: LoadState; data: readonly BusStop[] | null }
  /**
   * The route shapes estimation moves buses along, fetched in the background
   * after the map has first drawn, while buses are on. See `loadShapes`. Until
   * they are ready no bus is estimated, or described as estimated.
   */
  shapes: { state: LoadState; data: BusShapes | null }
}

const WAITING: LiveFeed = {
  held: new Map(),
  version: 0,
  status: { state: 'waiting', lastOkMs: null, rejected: NO_REJECTS },
}

/**
 * The live vehicles and each feed's condition.
 *
 * Written by the poller once per response, which is at most twice a minute,
 * with one `setState` for the whole response. The frame loop reads it with
 * `getState()` and nothing subscribes to it: the counts and status lines are
 * painted through refs like every other number on screen.
 */
export const useLive = create<LiveStore>()(() => ({
  bus: WAITING,
  ktm: WAITING,
  stops: { state: 'idle', data: null },
  shapes: { state: 'idle', data: null },
}))

/**
 * One feed's answer, into the store: one write, whatever happened.
 *
 * A failed or empty answer never erases what is held. Those vehicles stay,
 * ageing honestly, until `dropGone` says they are past ten minutes - which is
 * checked here too, so the held set does not grow for ever.
 *
 * @param answer The decoded body, or why there was none to decode.
 * @param nowMs The present, epoch ms.
 */
export function receive(
  mode: LiveMode,
  answer: Decoded | 'unavailable' | 'rate-limited',
  nowMs: number,
) {
  const feed = useLive.getState()[mode]
  if (typeof answer === 'string' || !answer.ok) {
    const held = dropGone(feed.held, nowMs)
    useLive.setState({
      [mode]: {
        held,
        version: held === feed.held ? feed.version : feed.version + 1,
        status: {
          state: typeof answer === 'string' ? answer : 'unreadable',
          lastOkMs: feed.status.lastOkMs,
          // The latest response had no reports in it to reject.
          rejected: NO_REJECTS,
        },
      },
    })
    return
  }
  const { vehicles, rejected } = answer
  const nothing =
    vehicles.length === 0 && Object.values(rejected).every((n) => n === 0)
  useLive.setState({
    [mode]: {
      held: dropGone(mergeFixes(feed.held, vehicles), nowMs),
      version: feed.version + 1,
      status: { state: nothing ? 'empty' : 'ok', lastOkMs: nowMs, rejected },
    },
  })
}


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
