import { describe, expect, it } from 'vitest'
import { network, places, pointAt, prepare } from './index'
import type { Place, PreparedNetwork } from './types'

// These values are measured from the shipped snapshot, like every other sim
// test. A feed refresh that moves them is for a person to look at and update.
const prepared = prepare(network)
const all = places(prepared)

function place(list: Place[], name: string): Place {
  const found = list.find((p) => p.name === name)
  if (!found) throw new Error(`no place named ${name}`)
  return found
}

/** The stop's point on the track, using its line's direction 0, as places() does. */
function onTrack(net: PreparedNetwork, stopId: string) {
  for (const line of net.lines) {
    const dir = line.directions[0]
    const stop = dir.stops.find((s) => s.id === stopId)
    if (stop) return pointAt(line, stop.at, dir.reversed)
  }
  throw new Error(`stop ${stopId} is on no line`)
}

describe('places: grouping', () => {
  it('puts all 187 stops into 160 places, each stop exactly once', () => {
    expect(all).toHaveLength(160)
    const stops = all.flatMap((p) => p.stops)
    expect(stops).toHaveLength(187)
    expect(new Set(stops)).toEqual(new Set(Object.keys(network.stations)))
  })

  it('finds 22 interchanges', () => {
    expect(all.filter((p) => p.stops.length > 1)).toHaveLength(22)
  })

  it('makes Titiwangsa one place of four stops', () => {
    expect([...place(all, 'Titiwangsa').stops].sort()).toEqual(['AG3', 'MR11', 'PY17', 'SP3'])
  })

  it('never merges differently-named stops, however close', () => {
    // The closest differently-named pair in the feed, 230 m apart.
    expect(place(all, 'Plaza Rakyat').stops).toContain('AG8')
    expect(place(all, 'Merdeka').stops).toContain('KG17')
    expect(place(all, 'Plaza Rakyat').stops).not.toContain('KG17')
  })

  it('gives every stop of a place that place name', () => {
    for (const p of all) {
      expect(p.id).toBe(p.name)
      for (const id of p.stops) expect(network.stations[id].name, id).toBe(p.name)
    }
  })

  it('follows the data, not a list: a renamed stop becomes its own place', () => {
    const copy = structuredClone(prepared)
    copy.stations.MR11.name = 'Titiwangsa Monorail'
    const renamed = places(copy)
    expect(renamed).toHaveLength(161)
    expect(place(renamed, 'Titiwangsa Monorail').stops).toEqual(['MR11'])
    expect(place(renamed, 'Titiwangsa').stops).not.toContain('MR11')
  })
})

describe('places: what a place knows', () => {
  it('takes lines from the timetable', () => {
    expect(place(all, 'Masjid Jamek').lines).toEqual(['AG', 'KJ', 'PH'])
  })

  it('derives the same result twice', () => {
    expect(places(prepared)).toEqual(all)
  })

  it('puts a one-stop place exactly on its stop on the track', () => {
    const single = all.find((p) => p.stops.length === 1)!
    const point = onTrack(prepared, single.stops[0])
    expect(single.lon).toBe(point.lon)
    expect(single.lat).toBe(point.lat)
  })

  it('puts Sentul Timur on the point its two stops share', () => {
    // AG1 and SP1 are one platform on shared track. network.json stores each
    // stop's distance along its own line to 0.1 m, so their two track points
    // agree to that precision (today 7 cm), not bit for bit.
    const { kx, ky } = prepared.origin
    const metres = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) =>
      Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * ky)
    const p = place(all, 'Sentul Timur')
    const ag = onTrack(prepared, 'AG1')
    const sp = onTrack(prepared, 'SP1')
    expect(metres(ag, sp)).toBeLessThan(0.1)
    expect(metres(p, ag)).toBeLessThan(0.1)
    expect(metres(p, sp)).toBeLessThan(0.1)
  })

  it('measures Sentul Timur as one platform', () => {
    expect(place(all, 'Sentul Timur').transfers).toEqual([{ from: 'AG1', to: 'SP1', metres: 0 }])
  })

  it('measures Ampang Park at 293.6 m, from published coordinates', () => {
    const [t] = place(all, 'Ampang Park').transfers
    expect([t.from, t.to]).toEqual(['KJ9', 'PY20'])
    expect(Math.abs(t.metres - 293.6)).toBeLessThanOrEqual(0.1)
  })

  it('lists every pair once', () => {
    expect(place(all, 'Titiwangsa').transfers).toHaveLength(6)
    for (const p of all) {
      const n = p.stops.length
      expect(p.transfers, p.name).toHaveLength((n * (n - 1)) / 2)
    }
  })

  it('leaves the network it was given untouched', () => {
    const before = structuredClone(prepared)
    places(prepared)
    expect(prepared).toEqual(before)
  })
})
