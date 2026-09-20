import { describe, expect, it } from 'vitest'
import { network, prepare } from '../sim'
import { hexToRgb, stationDots } from './layers'
import type { StationDot } from './layers'
import { sharedCorridors } from './offset'
import {
  NEUTRAL,
  STATION_MODEL_URL,
  placeSelections,
  stationModelLayers,
  stationPlaces,
} from './places'
import type { Place } from './places'
import { MODEL_URL, VIADUCT_M, trainLayers } from './trains'
import type { TrainInstance } from './trains'
import { distinctSelections, selectionKey } from '../ui/inspect'
import type { Mode } from '../sim'

const rail = prepare(network)
const corridors = sharedCorridors(rail)
/** A separation in metres, for the tests that need one. The app's comes from the zoom. */
const GAP = 40
const dots = stationDots(rail, corridors, GAP)
const places = stationPlaces(rail, dots)

/** Metres apart, in the network's own flat projection — as everything else here measures. */
function metresApart(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[0] - b[0]) * rail.origin.kx, (a[1] - b[1]) * rail.origin.ky)
}

function place(name: string): Place {
  const found = places.find((p) => p.name === name)
  if (!found) throw new Error(`no place called ${name}`)
  return found
}

function membersOf(p: Place): StationDot[] {
  return dots.filter((dot) => rail.stations[dot.id]?.name === p.name)
}

describe('grouping stops into places', () => {
  it('turns 187 stops into 160 places, 22 of them on more than one line', () => {
    expect(dots).toHaveLength(187)
    expect(places).toHaveLength(160)
    expect(places.filter((p) => p.lines.length > 1)).toHaveLength(22)
  })

  it('accounts for every stop exactly once', () => {
    const counted = places.reduce((n, p) => n + membersOf(p).length, 0)
    expect(counted).toBe(dots.length)
  })

  it('never merges two differently-named stops', () => {
    // Which is why exact name equality is enough and is not a heuristic. The
    // closest two stops that are NOT the same station are a couple of hundred
    // metres apart, while two platforms of one station can be nearly 300 m
    // apart (Ampang Park) — so a distance rule would get both of those wrong.
    let closest = Infinity
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        if (rail.stations[dots[i].id].name === rail.stations[dots[j].id].name) continue
        closest = Math.min(closest, metresApart(dots[i].position, dots[j].position))
      }
    }
    expect(closest).toBeGreaterThan(150)
  })

  it('takes a place with one line at its one platform, exactly', () => {
    const single = places.find((p) => p.lines.length === 1)!
    const [only] = membersOf(single)
    expect(single.position[0]).toBe(only.position[0])
    expect(single.position[1]).toBe(only.position[1])
  })

  it('is positioned from the drawn platforms, not from the feed’s coordinates', () => {
    // The feed's coordinates sit up to 105 m from the rails. Find the stop
    // where that is worst and check the place went with the drawn position.
    let worst = dots[0]
    let off = 0
    for (const dot of dots) {
      const station = rail.stations[dot.id]
      const d = metresApart(dot.position, [station.lon, station.lat])
      if (d > off) {
        off = d
        worst = dot
      }
    }
    expect(off).toBeGreaterThan(50)
    const p = place(rail.stations[worst.id].name)
    expect(metresApart(p.position, worst.position)).toBeLessThan(off)
  })

  it('draws a place at the height the trains use, so a train stands at its platform', () => {
    for (const p of places) expect(p.position[2]).toBe(VIADUCT_M)
  })
})

describe('a place on the shared corridor', () => {
  // Ampang and Sri Petaling share their last 8.5 km, so each is drawn half a
  // gap to one side of the alignment. Pudu is one of the stations on it.
  const pudu = place('Pudu')

  it('is served by both lines of the corridor', () => {
    expect(pudu.lines.sort()).toEqual(['AG', 'PH'])
  })

  it('sits with its own platforms rather than beside them', () => {
    for (const member of membersOf(pudu)) {
      expect(metresApart(pudu.position, member.position)).toBeLessThanOrEqual(GAP)
    }
  })

  it('moves with them when the camera changes the gap', () => {
    // The platforms straddle the alignment, so the place lands between them —
    // and the wider the camera pushes them apart, the further each platform is
    // from it. What must never happen is the place staying put while the
    // markers it stands for slide away.
    for (const gap of [0, 200]) {
      const wide = stationPlaces(rail, stationDots(rail, corridors, gap)).find(
        (p) => p.name === 'Pudu',
      )!
      const spread = stationDots(rail, corridors, gap)
        .filter((dot) => rail.stations[dot.id].name === 'Pudu')
        .map((dot) => metresApart(wide.position, dot.position))
      for (const d of spread) expect(d).toBeCloseTo(gap / 2, 0)
    }
  })
})

describe('what a place is drawn as', () => {
  it('takes its one line’s colour where it has one line', () => {
    const single = places.find((p) => p.lines.length === 1)!
    const line = rail.lines.find((l) => l.id === single.lines[0])!
    expect(single.color).toEqual(hexToRgb(line.color))
  })

  it('takes the neutral where several lines call, which is what marks an interchange', () => {
    for (const p of places) {
      if (p.lines.length > 1) expect(p.color).toEqual(NEUTRAL)
      else expect(p.color).not.toEqual(NEUTRAL)
    }
  })

  it('is drawn as one of the modes that actually calls there', () => {
    const modeOf = new Map(rail.lines.map((l) => [l.id, l.mode]))
    for (const p of places) {
      expect(p.lines.map((id) => modeOf.get(id))).toContain(p.mode)
    }
  })

  it('takes the heaviest railway at an interchange', () => {
    // Titiwangsa is two LRT lines, an MRT line and the monorail. Something has
    // to be drawn, and the largest structure present is the least surprising.
    expect(place('Titiwangsa').lines.sort()).toEqual(['AG', 'MR', 'PH', 'PYL'])
    expect(place('Titiwangsa').mode).toBe('MRT')
    // A bus stop that shares a name with an LRT station is drawn as the station.
    expect(place('USJ 7').mode).toBe('LRT')
  })

  it('lies along its own track', () => {
    // The bearing comes from the `pointAt` call that placed the marker, so a
    // platform runs with the rails rather than across them.
    for (const p of places) {
      expect(p.bearing).toBe(membersOf(p)[0].bearing)
      expect(p.bearing).toBeGreaterThanOrEqual(0)
      expect(p.bearing).toBeLessThan(360)
    }
  })
})

describe('the station models', () => {
  const layers = stationModelLayers(places, 8, 'test-label-layer')

  it('draws one place once, under the model of its own mode', () => {
    expect(layers).toHaveLength(4)
    const drawn = layers.flatMap((l) => l.props.data as Place[])
    expect(drawn).toHaveLength(places.length)
    for (const layer of layers) {
      const mode = layer.id.replace('station-models-', '')
      for (const p of layer.props.data as Place[]) expect(p.mode).toBe(mode)
    }
  })

  it('draws a different model for each mode, and never a train', () => {
    // Read from the table rather than from the built layer: `scenegraph` is an
    // async prop, so until deck.gl has fetched it `props.scenegraph` is the
    // resolved model and not the URL that was handed in.
    expect(new Set(Object.values(STATION_MODEL_URL)).size).toBe(4)
    for (const mode of Object.keys(STATION_MODEL_URL) as Mode[]) {
      expect(STATION_MODEL_URL[mode]).not.toBe(MODEL_URL[mode])
    }
  })

  it('answers picks, as a second target beside the four-pixel ring', () => {
    for (const layer of layers) expect(layer.props.pickable).toBe(true)
  })

  it('is scaled by the camera, like the trains, with no pixel floor', () => {
    expect(stationModelLayers(places, 8, 'x')[0].props.sizeScale).toBe(2)
    expect(stationModelLayers(places, 40, 'x')[0].props.sizeScale).toBe(10)
  })

  it('is scaled by exactly what a train is scaled by, at every camera', () => {
    // Not a coincidence worth losing. A train standing at a platform sits in
    // the gap the two platforms leave open, and it stays in that gap at every
    // zoom only because the station and the train grow by the same number. Give
    // the stations a scale of their own and a canopy eventually closes over the
    // train it is meant to mark — and takes its picks with it.
    const noTrains: Record<Mode, TrainInstance[]> = { LRT: [], MRT: [], MRL: [], BRT: [] }
    for (const W of [4, 8, 40, 420]) {
      expect(stationModelLayers(places, W, 'x')[0].props.sizeScale).toBe(
        trainLayers(noTrains, W, 'x')[0].props.sizeScale,
      )
    }
  })
})

describe('what a pick on a model means', () => {
  it('gives one selection per platform, for the lines that actually call there', () => {
    for (const p of places) {
      const picked = placeSelections(p)
      expect(picked).toHaveLength(membersOf(p).length)
      expect(picked.map((s) => s.lineId).sort()).toEqual([...p.lines].sort())
      for (const s of picked) expect(s.kind).toBe('station')
    }
  })

  it('is the very thing the ring gives, where one line calls', () => {
    // So the model and the ring under it are one selection said twice, and the
    // card opens instead of a chooser asking which of one.
    const single = places.find((p) => p.lines.length === 1)!
    const [ring] = membersOf(single)
    const both = distinctSelections([
      ...placeSelections(single),
      { kind: 'station', lineId: ring.line, stopId: ring.id },
    ])
    expect(both).toHaveLength(1)
    expect(selectionKey(both[0])).toBe(`station:${ring.line}:${ring.id}`)
  })

  it('offers the four at Titiwangsa, and they stay four distinct things', () => {
    const picked = placeSelections(place('Titiwangsa'))
    expect(picked).toHaveLength(4)
    expect(distinctSelections(picked)).toHaveLength(4)
    expect(new Set(picked.map((s) => s.stopId)).size).toBe(4)
  })

  it('names a stop the timetable knows, so the card can describe it', () => {
    for (const p of places) {
      for (const s of placeSelections(p)) {
        expect(rail.stations[s.stopId].name).toBe(p.name)
        expect(rail.lines.some((l) => l.id === s.lineId)).toBe(true)
      }
    }
  })
})

describe('hiding a line', () => {
  it('takes its stations out of the places, and a place with it if it was the only line', () => {
    const withoutMonorail = stationPlaces(
      rail,
      stationDots(rail, corridors, GAP, new Set(['MR'])),
    )
    expect(withoutMonorail.length).toBeLessThan(places.length)
    for (const p of withoutMonorail) expect(p.lines).not.toContain('MR')
    // Titiwangsa is still there: three other lines call at it, and with the
    // monorail gone it is still an interchange.
    const titiwangsa = withoutMonorail.find((p) => p.name === 'Titiwangsa')!
    expect(titiwangsa.lines.sort()).toEqual(['AG', 'PH', 'PYL'])
  })
})
