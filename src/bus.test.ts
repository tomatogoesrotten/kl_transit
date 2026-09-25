import { describe, expect, it } from 'vitest'
import routes from '../data/bus-routes.json'
import shapes from '../data/bus-shapes.json'
import stops from '../data/bus-stops.json'
import { BOX } from './live/feed'

// Pinned to the rapid-bus-kl snapshot of 2026-09-25, like network.test.ts is to
// the rail one. A daily refresh that changes the bus network is MEANT to turn
// these red, for a person to look at and update. The rules any valid bus feed
// satisfies are in scripts/check_feed.py, which the refresh runs instead.
const byRoute = routes as Record<string, string[]>
const shapeOf = shapes.trips as Record<string, string>
const shapeById = shapes.shapes as Record<string, number[][]>

describe('bus data', () => {
  it('has the counts measured from this snapshot', () => {
    expect(Object.keys(byRoute).length).toBe(137)
    expect(stops.length).toBe(4053)
    expect(Object.keys(shapeById).length).toBe(171)
    expect(Object.keys(shapeOf).length).toBe(2097)
  })

  it('names routes as the public knows them', () => {
    expect(byRoute.U3000[0]).toBe('300')
    expect(byRoute.T3048[0]).toBe('T304')
    expect(byRoute.S6060[0]).toBe('PAVILION BUKIT JALIL (PAVBJ)')
  })

  it('keeps a stop name with a comma in it whole', () => {
    expect(stops.find((s) => s[0] === '1006388')?.[1]).toBe('LG127 TAMAN DESA IDAMAN,KG OLAK LEMPIT')
  })

  it('puts every stop inside the box the live feed accepts', () => {
    for (const [id, , lon, lat] of stops as [string, string, number, number][]) {
      expect(lat, id).toBeGreaterThan(BOX.minLat)
      expect(lat, id).toBeLessThan(BOX.maxLat)
      expect(lon, id).toBeGreaterThan(BOX.minLon)
      expect(lon, id).toBeLessThan(BOX.maxLon)
    }
  })

  it("gives every trip a shape of at least two points", () => {
    for (const [trip, shape] of Object.entries(shapeOf)) {
      expect(shapeById[shape]?.length ?? 0, trip).toBeGreaterThanOrEqual(2)
    }
  })

  it('uses the same flat projection as network.json', async () => {
    const { default: network } = await import('../data/network.json')
    expect(shapes.origin).toEqual(network.origin)
  })
})
