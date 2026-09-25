import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLive } from '../ui/store'
import { loadStops } from './busdata'

const STOPS = [['1005840', 'STESEN BRT SETIA JAYA', 101.61224, 3.08286]]

beforeEach(() => useLive.setState({ stops: { state: 'idle', data: null } }))
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
