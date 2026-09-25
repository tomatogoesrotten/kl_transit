import { beforeEach, describe, expect, it, vi } from 'vitest'
import { klNow } from '../sim'
import { NO_REJECTS } from '../live/feed'
import type { Decoded, LiveVehicle } from '../live/feed'
import { PEAK_SEC, receive, setMs, useClock, useLive, useView } from './store'
import type { Selection } from './store'

// A fixed moment to scrub away from: Saturday 20 September 2025, 22:00 in Kuala
// Lumpur. Late enough that a scrub to the morning peak would cross midnight if
// the day were ever allowed to move, which it is not.
const SAT_2200 = Date.UTC(2025, 8, 20, 14, 0, 0)

function reset(over: Partial<ReturnType<typeof useClock.getState>> = {}) {
  useClock.setState({
    mode: 'live',
    speed: 1,
    override: 'auto',
    ms: SAT_2200,
    trainsRunning: true,
    ...over,
  })
}

const state = () => useClock.getState()

beforeEach(() => reset())

describe('now()', () => {
  it('is the only full reset: live, 1x, and the override back to auto', () => {
    reset({ mode: 'paused', speed: 60, override: 'Sun' })
    state().now()
    expect(state()).toMatchObject({ mode: 'live', speed: 1, override: 'auto' })
  })
})

describe('togglePause()', () => {
  it('stops a live clock', () => {
    state().togglePause()
    expect(state().mode).toBe('paused')
  })

  it('stops a running clock', () => {
    reset({ mode: 'running', speed: 10 })
    state().togglePause()
    expect(state().mode).toBe('paused')
  })

  it('plays at the remembered speed, and never back to live', () => {
    reset({ mode: 'paused', speed: 10 })
    state().togglePause()
    expect(state()).toMatchObject({ mode: 'running', speed: 10 })
  })
})

describe('setSpeed()', () => {
  it('keeps a live clock live at 1x, because real speed is live speed', () => {
    state().setSpeed(1)
    expect(state()).toMatchObject({ mode: 'live', speed: 1 })
  })

  it('drops out of live at 10x', () => {
    state().setSpeed(10)
    expect(state()).toMatchObject({ mode: 'running', speed: 10 })
  })

  it('starts a paused clock running, at 1x as well', () => {
    reset({ mode: 'paused', speed: 60 })
    state().setSpeed(1)
    expect(state()).toMatchObject({ mode: 'running', speed: 1 })
  })

  it('changes speed while running', () => {
    reset({ mode: 'running', speed: 10 })
    state().setSpeed(60)
    expect(state()).toMatchObject({ mode: 'running', speed: 60 })
  })
})

describe('setOverride()', () => {
  it('forces a timetable without touching the clock', () => {
    reset({ mode: 'paused' })
    state().setOverride('Sun')
    expect(state()).toMatchObject({ mode: 'paused', override: 'Sun' })
  })
})

describe('scrubTo()', () => {
  it('moves to that time of day, on the same Kuala Lumpur day', () => {
    state().scrubTo(7 * 3600 + 45 * 60)
    const t = klNow(state().ms)
    expect(t.sec).toBe(27900)
    expect(t.day).toBe(20)
    expect(t.month).toBe(9)
  })

  it('drops a live clock out of live, or the next frame would overwrite it', () => {
    state().scrubTo(3600)
    expect(state().mode).toBe('running')
  })

  it('leaves a paused clock paused: scrubbing a frozen clock is the useful case', () => {
    reset({ mode: 'paused' })
    state().scrubTo(3600)
    expect(state().mode).toBe('paused')
    expect(klNow(state().ms).sec).toBe(3600)
  })

  it('leaves a running clock running at its speed', () => {
    reset({ mode: 'running', speed: 60 })
    state().scrubTo(3600)
    expect(state()).toMatchObject({ mode: 'running', speed: 60 })
  })
})

describe('jumpToPeak()', () => {
  it('moves to 07:45 and un-pauses', () => {
    reset({ mode: 'paused' })
    state().jumpToPeak()
    expect(klNow(state().ms).sec).toBe(PEAK_SEC)
    expect(state().mode).toBe('running')
  })

  it('un-lives too, so the jump is not undone by the next frame', () => {
    state().jumpToPeak()
    expect(state().mode).toBe('running')
  })
})

describe('setMs()', () => {
  it('writes the moment without notifying anybody', () => {
    const listener = vi.fn()
    const off = useClock.subscribe(listener)
    setMs(SAT_2200 + 5000)
    off()
    expect(state().ms).toBe(SAT_2200 + 5000)
    // Sixty of these a second. Anything subscribed to `ms` would re-render at
    // the frame rate, which is the thing this whole design avoids.
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('setTrainsRunning()', () => {
  it('writes only when the answer changes', () => {
    const listener = vi.fn()
    const off = useClock.subscribe(listener)
    state().setTrainsRunning(true) // already true on a fresh store
    expect(listener).not.toHaveBeenCalled()
    state().setTrainsRunning(false)
    state().setTrainsRunning(false)
    off()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(state().trainsRunning).toBe(false)
  })
})

describe('useView', () => {
  const view = () => useView.getState()
  const aTrain: Selection = {
    kind: 'train',
    lineId: 'AG',
    dir: 0,
    dep: 27000,
    departedMs: SAT_2200,
  }

  beforeEach(() => {
    useView.setState({ selection: null, following: false, hidden: new Set() })
  })

  it('never carries a follow over to something else', () => {
    view().select(aTrain)
    view().toggleFollow()
    expect(view().following).toBe(true)
    view().select({ kind: 'station', lineId: 'PH', stopId: 'PH1' })
    expect(view().following).toBe(false)
  })

  it('hands out a new Set each time, so a layer can tell by identity', () => {
    const before = view().hidden
    view().toggleLine('AG')
    expect(view().hidden).not.toBe(before)
    expect(view().hidden.has('AG')).toBe(true)
    view().toggleLine('AG')
    expect(view().hidden.has('AG')).toBe(false)
  })

  it('clears a selection whose line is hidden, including a finished trip', () => {
    view().select(aTrain)
    view().toggleFollow()
    // Hiding some other line leaves it alone...
    view().toggleLine('PH')
    expect(view().selection).toEqual(aTrain)
    // ...and hiding its own line clears it rather than describing something
    // that is no longer drawn. The line id travels with the selection exactly
    // so this works for a train whose trip has already ended.
    view().toggleLine('AG')
    expect(view().selection).toBeNull()
    expect(view().following).toBe(false)
  })

  it('stops following only when it was following', () => {
    const listener = vi.fn()
    const off = useView.subscribe(listener)
    view().stopFollowing()
    expect(listener).not.toHaveBeenCalled()
    view().select(aTrain)
    view().toggleFollow()
    view().stopFollowing()
    off()
    expect(view().following).toBe(false)
  })
})

describe('useView: the card, following, and what one click found', () => {
  const view = () => useView.getState()
  const aTrain: Selection = {
    kind: 'train',
    lineId: 'AG',
    dir: 0,
    dep: 27000,
    departedMs: SAT_2200,
  }
  const otherWay: Selection = { ...aTrain, dir: 1 }
  const aStation = { kind: 'station', lineId: 'AG', stopId: 'AG1' } as const

  beforeEach(() => {
    useView.setState({
      selection: null,
      cardOpen: false,
      following: false,
      choices: [],
      goTo: null,
      hidden: new Set(),
      liveOff: new Set(),
    })
  })

  it('opens the card on whatever is selected, and shuts it on nothing', () => {
    view().select(aTrain)
    expect(view()).toMatchObject({ selection: aTrain, cardOpen: true })
    view().select(null)
    expect(view()).toMatchObject({ selection: null, cardOpen: false })
  })

  it('keeps following when the card is shut, which is the whole point', () => {
    // On a phone the card covers the bottom of the screen, which is where the
    // camera had just centred the train. Shutting it used to stop the follow,
    // so the only way to SEE the train was to stop following it.
    view().select(aTrain)
    view().toggleFollow()
    view().closeCard()
    expect(view().cardOpen).toBe(false)
    expect(view().following).toBe(true)
    expect(view().selection).toEqual(aTrain)
  })

  it('lets the card be brought back without touching the camera', () => {
    view().select(aTrain)
    view().toggleFollow()
    view().closeCard()
    view().showCard()
    expect(view()).toMatchObject({ cardOpen: true, following: true })
  })

  it('deselects when the card is shut and nothing is being followed', () => {
    view().select(aTrain)
    view().closeCard()
    expect(view()).toMatchObject({ selection: null, cardOpen: false })
  })

  it('stops following when the viewer takes the map back, and leaves the card alone', () => {
    view().select(aTrain)
    view().toggleFollow()
    view().closeCard()
    view().stopFollowing()
    expect(view()).toMatchObject({ following: false, cardOpen: false })
  })

  it('brings the card back when the followed train stops being drawn', () => {
    // The display has to say the train is no longer running, and a shut card
    // says nothing at all.
    view().select(aTrain)
    view().toggleFollow()
    view().closeCard()
    view().followedGone()
    expect(view()).toMatchObject({ following: false, cardOpen: true, selection: aTrain })
  })

  it('offers a choice, and choosing one selects it and clears the rest', () => {
    view().offer([aTrain, otherWay])
    expect(view().choices).toHaveLength(2)
    view().select(otherWay)
    expect(view().selection).toEqual(otherWay)
    expect(view().choices).toHaveLength(0)
  })

  it('drops the choices without deselecting, for Escape', () => {
    view().select(aTrain)
    view().offer([aTrain, otherWay])
    view().clearChoices()
    expect(view().choices).toHaveLength(0)
    expect(view().selection).toEqual(aTrain)
  })

  it('asks the map to go to a station, once per press', () => {
    view().goToStation(aStation)
    expect(view()).toMatchObject({ selection: aStation, cardOpen: true })
    const first = view().goTo!
    expect(first.stopId).toBe('AG1')
    // Pressing the same station again is a second move, not a no-op: the map
    // watches this field for a change.
    view().goToStation(aStation)
    expect(view().goTo).not.toBe(first)
    expect(view().goTo!.n).toBe(first.n + 1)
  })

  it('stops following when the viewer asks to go and look somewhere else', () => {
    view().select(aTrain)
    view().toggleFollow()
    view().goToStation(aStation)
    expect(view().following).toBe(false)
  })

  it('shuts the card when the selected thing is hidden with its line', () => {
    view().select(aTrain)
    view().toggleFollow()
    view().toggleLine('AG')
    expect(view()).toMatchObject({ selection: null, cardOpen: false, following: false })
  })
})

describe('useView: live modes', () => {
  const view = () => useView.getState()
  const aBus: Selection = { kind: 'vehicle', mode: 'bus', id: 'VFB2440' }

  beforeEach(() => {
    useView.setState({ selection: null, cardOpen: false, choices: [], hidden: new Set(), liveOff: new Set() })
  })

  it('switches a mode off and on again, with a new set each time', () => {
    const before = view().liveOff
    view().toggleLive('bus')
    expect([...view().liveOff]).toEqual(['bus'])
    expect(view().liveOff).not.toBe(before)
    view().toggleLive('bus')
    expect(view().liveOff.size).toBe(0)
  })

  it('clears a selected vehicle when its mode is hidden', () => {
    view().select(aBus)
    view().toggleLive('bus')
    expect(view()).toMatchObject({ selection: null, cardOpen: false })
  })

  it('keeps a selected vehicle when the OTHER mode is hidden, or a rail line', () => {
    view().select(aBus)
    view().toggleLive('ktm')
    view().toggleLine('AG')
    expect(view().selection).toEqual(aBus)
  })
})

describe('receive: one feed answer into the store', () => {
  const NOW = 1_790_309_400_000
  const v = (id: string, ageS: number): LiveVehicle => ({
    mode: 'ktm',
    id,
    label: 'ETS304',
    routeId: null,
    tripId: id,
    position: [101.7, 3.1],
    bearing: null,
    fixSec: NOW / 1000 - ageS,
  })
  const answer = (vehicles: LiveVehicle[], nullIsland = 0): Decoded => ({
    ok: true,
    headerSec: NOW / 1000,
    vehicles,
    rejected: { ...NO_REJECTS, nullIsland },
  })
  const ktm = () => useLive.getState().ktm

  beforeEach(() => {
    useLive.setState({
      ktm: {
        held: new Map(),
        version: 0,
        status: { state: 'waiting', lastOkMs: null, rejected: NO_REJECTS },
      },
    })
  })

  it('writes the store once per response', () => {
    const listener = vi.fn()
    const off = useLive.subscribe(listener)
    receive('ktm', answer([v('1', 30), v('2', 30)], 1), NOW)
    off()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(ktm().held.size).toBe(2)
    expect(ktm().status).toEqual({
      state: 'ok',
      lastOkMs: NOW,
      rejected: { ...NO_REJECTS, nullIsland: 1 },
    })
  })

  it('keeps what it holds through an empty answer, and says it was empty', () => {
    receive('ktm', answer([v('1', 30)]), NOW)
    receive('ktm', answer([]), NOW + 30_000)
    expect(ktm().held.size).toBe(1)
    expect(ktm().status.state).toBe('empty')
  })

  it('keeps what it holds through a failure, and remembers when it last answered', () => {
    receive('ktm', answer([v('1', 30)], 1), NOW)
    receive('ktm', 'rate-limited', NOW + 60_000)
    expect(ktm().held.size).toBe(1)
    expect(ktm().status).toEqual({ state: 'rate-limited', lastOkMs: NOW, rejected: NO_REJECTS })
    receive('ktm', { ok: false }, NOW + 120_000)
    expect(ktm().status.state).toBe('unreadable')
  })

  it('lets go of a report once it is past ten minutes', () => {
    receive('ktm', answer([v('1', 30)]), NOW)
    receive('ktm', 'unavailable', NOW + 600_000)
    expect(ktm().held.size).toBe(0)
  })
})

// The fixes change on every response and the frame loop reads them with
// getState(). A component subscribed to them would re-render on each one, and
// a hook in the frame loop would freeze at mount. Nothing may do either.
const appSources = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('nothing subscribes to the live fixes', () => {
  it('uses useLive only through getState or setState', () => {
    const files = Object.keys(appSources)
    expect(files).toContain('../live/poll.ts')
    for (const file of files) {
      expect(appSources[file], file).not.toMatch(/useLive\s*\(|useLive\.subscribe/)
    }
  })
})
