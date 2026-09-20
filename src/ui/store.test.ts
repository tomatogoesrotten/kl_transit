import { beforeEach, describe, expect, it, vi } from 'vitest'
import { klNow } from '../sim'
import { PEAK_SEC, setMs, useClock } from './store'

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
