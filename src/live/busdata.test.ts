import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLive } from '../ui/store'
import shapesFile from '../../data/bus-shapes.json'
import { network, pointAt } from '../sim'
import { loadShapes, loadStops, prepareShapes } from './busdata'

const STOPS = [['1005840', 'STESEN BRT SETIA JAYA', 101.61224, 3.08286]]

beforeEach(() =>
  useLive.setState({ stops: { state: 'idle', data: null }, shapes: { state: 'idle', data: null } }),
)
afterEach(() => vi.unstubAllGlobals())

describe('loadStops', () => {
  it('fetches the hashed stops file once, however often it is called', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(STOPS)))
    vi.stubGlobal('fetch', fetch)
    const first = loadStops()
    expect(useLive.getState().stops.state).toBe('loading')
    // The frame loop calls it every frame while the bus view is shown.
    await Promise.all([first, loadStops(), loadStops()])
    await loadStops()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toMatch(/bus-stops.*\.json/)
    expect(useLive.getState().stops).toEqual({ state: 'ready', data: STOPS })
  })

  it('says failed for an HTTP error, and does not try again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetch = vi.fn(async () => new Response('gone', { status: 404 }))
    vi.stubGlobal('fetch', fetch)
    await loadStops()
    await loadStops()
    expect(useLive.getState().stops).toEqual({ state: 'failed', data: null })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('says failed when the network refuses, or the body is not a list', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('blocked'))))
    await loadStops()
    expect(useLive.getState().stops.state).toBe('failed')

    useLive.setState({ stops: { state: 'idle', data: null } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"not":"a list"}')))
    await loadStops()
    expect(useLive.getState().stops.state).toBe('failed')
  })
})

describe('prepareShapes', () => {
  const { origin } = network
  // Two shapes: one 1 km due east, and one too short to have a direction.
  const file = {
    origin,
    shapes: {
      A: [
        [origin.lon, origin.lat],
        [origin.lon + 1000 / origin.kx, origin.lat],
      ],
      B: [[origin.lon, origin.lat]],
    },
    trips: { t1: ['U3000', 'A'], t2: ['U3000', 'B'], t3: ['U3000', 'missing'] },
  }

  it('prepares each shape in metres along it, in the network projection', () => {
    const { shapes } = prepareShapes(file)
    const a = shapes.get('A')!
    expect(a.total).toBeCloseTo(1000, 6)
    expect(a.path).toBe(file.shapes.A)
    expect(pointAt(a, 500, false).bearingDeg).toBeCloseTo(90, 6)
  })

  it('indexes only trips whose shape can be used, and never a shape under two points', () => {
    const { shapes, trips } = prepareShapes(file)
    expect([...shapes.keys()]).toEqual(['A'])
    expect([...trips]).toEqual([['t1', 'A']])
  })

  it('prepares the whole shipped file', () => {
    const { shapes, trips } = prepareShapes(shapesFile)
    expect(shapes.size).toBe(171)
    expect(trips.size).toBe(2097)
    expect(trips.get('weekday_U6000_U600001_9')).toBe('U600001')
  })

  it('refuses something that is not a shapes file', () => {
    expect(() => prepareShapes({ not: 'shapes' })).toThrow()
    expect(() => prepareShapes(null)).toThrow()
  })
})

describe('loadShapes', () => {
  it('fetches the hashed shapes file once, however often it is called, and prepares it', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(shapesFile)))
    vi.stubGlobal('fetch', fetch)
    await Promise.all([loadShapes(), loadShapes()])
    await loadShapes()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toMatch(/bus-shapes.*\.json/)
    const { shapes } = useLive.getState()
    expect(shapes.state).toBe('ready')
    expect(shapes.data?.shapes.size).toBe(171)
  })

  it('says failed, once, when the file cannot be had', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetch = vi.fn(async () => new Response('gone', { status: 404 }))
    vi.stubGlobal('fetch', fetch)
    await loadShapes()
    await loadShapes()
    expect(useLive.getState().shapes).toEqual({ state: 'failed', data: null })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
