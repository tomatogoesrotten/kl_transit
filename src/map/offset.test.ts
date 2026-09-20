import { describe, expect, it } from 'vitest'
import { network, pointAt, prepare } from '../sim'
import type { Line, Network } from '../sim'
import {
  GAP_PX,
  TAPER_M,
  gapMetres,
  metresPerPixel,
  offsetAt,
  offsetPath,
  offsetPoint,
  sharedCorridors,
} from './offset'
import { halfWidth } from './trains'

const rail = prepare(network)
const corridors = sharedCorridors(rail)
const ag = rail.lines.find((l) => l.id === 'AG')!
const ph = rail.lines.find((l) => l.id === 'PH')!

/** Metres apart, in the network's own flat projection. Never haversine. */
function metresApart(a: readonly number[], b: readonly number[]) {
  return Math.hypot((a[0] - b[0]) * rail.origin.kx, (a[1] - b[1]) * rail.origin.ky)
}

/** How far east and north of `from` the point `to` is, in metres. */
function offset(from: readonly number[], to: readonly number[]) {
  return {
    east: (to[0] - from[0]) * rail.origin.kx,
    north: (to[1] - from[1]) * rail.origin.ky,
  }
}

describe('sharedCorridors', () => {
  it('finds the one pair in the feed that shares track, without being told', () => {
    expect([...corridors.keys()].sort()).toEqual(['AG', 'PH'])
    for (const list of corridors.values()) expect(list).toHaveLength(1)
    expect(corridors.get('AG')![0].lines).toEqual(['AG', 'PH'])
    expect(corridors.get('PH')![0].lines).toEqual(['AG', 'PH'])
  })

  it('measures the stretch each line shares', () => {
    // Measured from data/network.json, not assumed: Ampang from 6,405 m to its
    // terminus at 14,893 m, Sri Petaling from 28,762 m to its own at 37,250 m.
    const a = corridors.get('AG')![0]
    expect(a.from).toBeCloseTo(6404.7, 0)
    expect(a.to).toBeCloseTo(14892.7, 0)
    const p = corridors.get('PH')![0]
    expect(p.from).toBeCloseTo(28762.3, 0)
    expect(p.to).toBeCloseTo(37250.0, 0)
    // The same 8,488 m of track, seen from two different starting points.
    expect(a.to - a.from).toBeCloseTo(p.to - p.from, 0)
  })

  it('tapers where the corridor begins and not where the line ends', () => {
    for (const id of ['AG', 'PH']) {
      const c = corridors.get(id)![0]
      expect(c.taperIn, id).toBe(true)
      expect(c.taperOut, id).toBe(false)
    }
    expect(corridors.get('AG')![0].to).toBe(ag.total)
    expect(corridors.get('PH')![0].to).toBe(ph.total)
  })

  it('bridges the vertices the two lines do not share exactly', () => {
    // Ampang shares 89 of the 99 vertices in its corridor: ten places where one
    // line carries curve detail the other does not, leaving gaps of up to 371 m.
    // Treating those as the end of the corridor would snap the drawn line back
    // to the centre ten times along the stretch.
    expect(corridors.get('AG')![0].to - corridors.get('AG')![0].from).toBeGreaterThan(8000)
  })

  it('puts the two lines on opposite sides, in the same order every time', () => {
    // If this were feed order rather than sorted line ids, a rebuilt
    // network.json could swap the two lines' sides from one reload to the next.
    const again = sharedCorridors(prepare(network))
    for (const id of ['AG', 'PH']) {
      expect(again.get(id)![0].slot, id).toBe(corridors.get(id)![0].slot)
    }
    expect(corridors.get('AG')![0].slot).toBe(-0.5)
    expect(corridors.get('PH')![0].slot).toBe(0.5)
  })

  it('reports nothing for a line that shares no vertex with any other', () => {
    for (const line of rail.lines) {
      if (line.id === 'AG' || line.id === 'PH') continue
      expect(corridors.has(line.id), line.id).toBe(false)
    }
  })
})

describe('offsetAt', () => {
  const { from, to, slot } = corridors.get('AG')![0]

  it('is zero away from a corridor', () => {
    expect(offsetAt(corridors, 'AG', from - 1)).toBe(0)
    expect(offsetAt(corridors, 'AG', 0)).toBe(0)
    expect(offsetAt(corridors, 'KJ', 5000)).toBe(0)
  })

  it('is the full slot in the middle of the corridor', () => {
    expect(offsetAt(corridors, 'AG', (from + to) / 2)).toBe(slot)
    expect(offsetAt(corridors, 'PH', 33000)).toBe(0.5)
  })

  it('reaches exactly zero at the open end, and ramps monotonically from it', () => {
    // Math.abs because the slot is negative, and -0 is not 0 to `toBe`.
    expect(Math.abs(offsetAt(corridors, 'AG', from))).toBe(0)
    let last = 0
    for (let d = 0; d <= TAPER_M; d += 10) {
      const here = Math.abs(offsetAt(corridors, 'AG', from + d))
      expect(here).toBeGreaterThanOrEqual(last)
      last = here
    }
    expect(last).toBe(Math.abs(slot))
    expect(Math.abs(offsetAt(corridors, 'AG', from + TAPER_M / 2))).toBeCloseTo(
      Math.abs(slot) / 2,
      9,
    )
  })

  it('does not taper at a terminus: two parallel stubs are honest', () => {
    expect(offsetAt(corridors, 'AG', to)).toBe(slot)
    expect(offsetAt(corridors, 'AG', to - 1)).toBe(slot)
  })
})

describe('gapMetres', () => {
  const lat = 3.146

  it('is the same ground-per-pixel relation the trains are sized with', () => {
    // Not a second copy of the arithmetic: `halfWidth` is 3.05 metres per pixel
    // between its bounds, so dividing it back out must give the same number.
    for (const zoom of [11, 12, 13]) {
      expect(halfWidth(zoom, lat) / 3.05).toBeCloseTo(metresPerPixel(zoom, lat), 9)
    }
    expect(gapMetres(12, lat)).toBeCloseTo(GAP_PX * metresPerPixel(12, lat), 9)
  })

  it('shrinks on the ground as the camera moves in, so the gap on screen holds', () => {
    // The whole point of measuring the separation in pixels.
    for (const zoom of [10, 12, 14, 16, 18]) {
      expect((gapMetres(zoom, lat) / metresPerPixel(zoom, lat)).toFixed(6)).toBe(
        GAP_PX.toFixed(6),
      )
    }
    expect(gapMetres(18, lat)).toBeLessThan(gapMetres(12, lat))
  })
})

describe('the direction of the offset', () => {
  /** Two lines drawn on one due-north path, so east and west are unambiguous. */
  function northLine(id: string): Line {
    return {
      id,
      code: id,
      name: id,
      mode: 'LRT',
      color: '#000000',
      length_m: 1000,
      // Due north, and identical for both lines: the whole path is a corridor.
      path: [
        [101.7, 3.0],
        [101.7, 3.005],
        [101.7, 3.01],
      ],
      directions: [
        {
          dir: 0,
          to: 'north',
          reversed: false,
          stops: [
            { id: `${id}1`, arr: 0, dep: 0, at: 0 },
            { id: `${id}2`, arr: 600, dep: 600, at: 1105 },
          ],
          headways: { MonFri: [], Sat: [], Sun: [] },
        },
      ],
    }
  }

  const twin: Network = {
    origin: rail.origin,
    generated_from: 'a test',
    lines: [northLine('AA'), northLine('BB')],
    stations: {},
  }
  const pair = prepare(twin)
  const found = sharedCorridors(pair)
  const GAP = 100

  it('shares the whole of both lines, so neither end tapers', () => {
    for (const id of ['AA', 'BB']) {
      const c = found.get(id)![0]
      expect(c.taperIn, id).toBe(false)
      expect(c.taperOut, id).toBe(false)
    }
  })

  it('sends a northbound corridor due east and due west', () => {
    for (const line of pair.lines) {
      const centre = pointAt(line, line.total / 2, false)
      const drawn = offsetPoint(line, found, GAP, line.total / 2)
      const { east, north } = offset([centre.lon, centre.lat], drawn)
      expect(north, line.id).toBeCloseTo(0, 6)
      expect(Math.abs(east), line.id).toBeCloseTo(GAP / 2, 6)
    }
  })

  it('puts the two lines on opposite sides of the track, a full gap apart', () => {
    const [a, b] = pair.lines.map((line) => offsetPoint(line, found, GAP, line.total / 2))
    const centre = pointAt(pair.lines[0], pair.lines[0].total / 2, false)
    // AA sorts first, so it takes the -0.5 slot: to the right of north, east.
    expect(offset([centre.lon, centre.lat], a).east).toBeCloseTo(GAP / 2, 6)
    expect(offset([centre.lon, centre.lat], b).east).toBeCloseTo(-GAP / 2, 6)
    expect(metresApart(a, b)).toBeCloseTo(GAP, 6)
  })
})

describe('offsetPath', () => {
  const GAP = 40

  it('leaves a line that shares nothing exactly where the feed put it', () => {
    const kj = rail.lines.find((l) => l.id === 'KJ')!
    const path = offsetPath(kj, corridors, GAP, 0)
    expect(path).toHaveLength(kj.path.length)
    path.forEach(([lon, lat], i) => {
      expect(lon).toBe(kj.path[i][0])
      expect(lat).toBe(kj.path[i][1])
    })
  })

  it('draws the shared stretch half a gap off the true alignment, and nothing else', () => {
    const a = offsetPath(ag, corridors, GAP, 0)
    const { from, to } = corridors.get('AG')![0]
    ag.cum.forEach((at, i) => {
      const away = metresApart(a[i], ag.path[i])
      if (at < from) expect(away, `AG at ${at}`).toBeCloseTo(0, 6)
      else if (at > from + TAPER_M && at <= to) expect(away, `AG at ${at}`).toBeCloseTo(GAP / 2, 3)
    })
  })

  it('carries the height it is given, so coincident lines have an order', () => {
    const path = offsetPath(ag, corridors, GAP, 1.5)
    for (const [, , z] of path) expect(z).toBe(1.5)
  })
})
