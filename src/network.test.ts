import { describe, expect, it } from 'vitest'
import network from '../data/network.json'

// Shape guard: if the daily feed refresh mangles network.json, fail here rather
// than in the browser. Not pinned to exact numbers — see GUIDE.md pitfalls.
describe('network.json', () => {
  it('has lines and stations', () => {
    expect(network.lines.length).toBeGreaterThan(5)
    expect(Object.keys(network.stations).length).toBeGreaterThan(100)
  })

  it('gives every line a path and two directions with stops', () => {
    for (const line of network.lines) {
      expect(line.path.length, line.id).toBeGreaterThan(10)
      expect(line.directions.length, line.id).toBe(2)
      for (const dir of line.directions) {
        expect(dir.stops.length, `${line.id}/${dir.dir}`).toBeGreaterThan(1)
        // headways: { MonFri | Sat | Sun: [startSec, endSec, everySec][] }
        expect(Object.keys(dir.headways), `${line.id}/${dir.dir}`).toContain('MonFri')
      }
    }
  })

  it('puts every station inside the Klang Valley', () => {
    for (const [id, s] of Object.entries(network.stations)) {
      expect(s.lon, id).toBeGreaterThan(100.9)
      expect(s.lon, id).toBeLessThan(102.1)
      expect(s.lat, id).toBeGreaterThan(2.7)
      expect(s.lat, id).toBeLessThan(3.6)
    }
  })
})
