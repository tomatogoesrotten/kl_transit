import { describe, expect, it } from 'vitest'
import bindings from 'gtfs-realtime-bindings'
import bus1Url from './fixtures/bus-2026-09-25T1209-KL.pb?inline'
import bus2Url from './fixtures/bus-2026-09-25T1210-KL.pb?inline'
import ktmUrl from './fixtures/ktm-2026-09-25T1209-KL.pb?inline'
import ktmEmptyUrl from './fixtures/ktm-2026-09-25T1209-KL-empty.pb?inline'
import {
  ageSec,
  decodeFeed,
  dropGone,
  due,
  freshness,
  mergeFixes,
  POLL_MS,
  STAGGER_MS,
} from './feed'
import type { Decoded, LiveVehicle } from './feed'

// Real responses, recorded 2026-09-25 around 12:10 KL and kept byte for byte.
// Loaded as base64 through Vite rather than with node:fs, which this project
// has no types for. Like network.json these are a snapshot, and the numbers
// below were measured from them.
const bytesOf = (dataUrl: string) =>
  Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0))

function ok(d: Decoded) {
  if (!d.ok) throw new Error('expected a readable feed')
  return d
}

const bus1 = ok(decodeFeed(bytesOf(bus1Url), 'bus'))
const bus2 = ok(decodeFeed(bytesOf(bus2Url), 'bus'))
const ktm = ok(decodeFeed(bytesOf(ktmUrl), 'ktm'))
const ktmEmpty = ok(decodeFeed(bytesOf(ktmEmptyUrl), 'ktm'))

const { FeedMessage } = bindings.transit_realtime

/** A one-entity KTM feed around a hand-made vehicle position. */
function feedOf(vehicle: object): Uint8Array {
  return FeedMessage.encode({
    header: { gtfsRealtimeVersion: '2.0', timestamp: 1790309342 },
    entity: [{ id: '0', vehicle }],
  }).finish()
}

const ETS = {
  trip: { tripId: '9999' },
  vehicle: { id: '9999', label: 'ETS399' },
  timestamp: 1790309265,
}

describe('decodeFeed on the recorded bus response', () => {
  it('yields 121 vehicles, each with a route id, a plate for an id and no label', () => {
    expect(bus1.vehicles).toHaveLength(121)
    const plates = FeedMessage.decode(bytesOf(bus1Url)).entity.map(
      (e) => e.vehicle?.vehicle?.licensePlate,
    )
    bus1.vehicles.forEach((v, i) => {
      expect(v.routeId).toMatch(/^[A-Z]\d+$/)
      expect(v.id).toBe(plates[i])
      expect(v.label).toBeNull()
    })
    expect(bus1.rejected).toEqual({ missing: 0, nullIsland: 0, outside: 0, incomplete: 0 })
  })

  it('converts the Long timestamps to plain numbers', () => {
    expect(bus1.headerSec).toBe(1790309296)
    const first = bus1.vehicles[0]
    expect(first.fixSec).toBe(1790309287)
    expect(typeof first.fixSec).toBe('number')
  })

  it('keeps every bus bearing, as a number', () => {
    for (const v of bus1.vehicles) expect(typeof v.bearing).toBe('number')
  })
})

describe('decodeFeed on the recorded KTM response', () => {
  it('yields the 8 usable ETS trains and rejects the one at 0,0', () => {
    expect(ktm.vehicles).toHaveLength(8)
    for (const v of ktm.vehicles) {
      expect(v.label).toMatch(/^ETS30\d$|^ETS310$/)
      // Absent from the wire, which the bindings would read as "".
      expect(v.routeId).toBeNull()
    }
    expect(ktm.rejected).toEqual({ missing: 0, nullIsland: 1, outside: 0, incomplete: 0 })
    expect(ktm.vehicles.map((v) => v.label)).not.toContain('ETS309')
  })

  it('draws no direction for KTM: its bearings are placeholders', () => {
    for (const v of ktm.vehicles) expect(v.bearing).toBeNull()
  })

  it('keeps a train in Johor, because that is where it is', () => {
    // ETS305 at 1.53, 103.73 - Johor Bahru, 300 km from Kuala Lumpur.
    expect(ktm.vehicles.find((v) => v.label === 'ETS305')?.position).toEqual([
      expect.closeTo(103.7285, 3),
      expect.closeTo(1.5346, 3),
    ])
  })
})

describe('decodeFeed on the recorded empty KTM response', () => {
  it('yields no vehicles, no rejects, and still a header timestamp', () => {
    expect(ktmEmpty.vehicles).toEqual([])
    expect(ktmEmpty.rejected).toEqual({ missing: 0, nullIsland: 0, outside: 0, incomplete: 0 })
    expect(ktmEmpty.headerSec).toBe(1790309374)
  })
})

describe('positions that cannot be real', () => {
  const one = (vehicle: object) => ok(decodeFeed(feedOf(vehicle), 'ktm'))

  it('rejects a NaN latitude as missing', () => {
    const d = one({ ...ETS, position: { latitude: NaN, longitude: 101.7 } })
    expect(d.vehicles).toEqual([])
    expect(d.rejected.missing).toBe(1)
  })

  it('rejects a position with no latitude on the wire as missing, and keeps the rest', () => {
    // The encoder always writes latitude, so the position goes in as raw bytes:
    // field 2 (position), holding only field 2 (longitude) as a float.
    const lon = new Uint8Array(new Float32Array([101.7]).buffer)
    const position = Uint8Array.from([0x12, 5, 0x15, ...lon])
    const bytes = FeedMessage.encode({
      header: { gtfsRealtimeVersion: '2.0' },
      entity: [
        { id: '0', vehicle: { ...ETS, $unknowns: [position] } },
        { id: '1', vehicle: { ...ETS, position: { latitude: 3.1, longitude: 101.7 } } },
      ],
    }).finish()
    const d = ok(decodeFeed(bytes, 'ktm'))
    expect(d.rejected.missing).toBe(1)
    expect(d.vehicles).toHaveLength(1)
  })

  it('rejects a vehicle with no position at all as missing', () => {
    expect(one(ETS).rejected.missing).toBe(1)
  })

  it('rejects 0,0 as null island, whatever the box', () => {
    const d = one({ ...ETS, position: { latitude: 0.0027, longitude: 0.0155 } })
    expect(d.rejected).toMatchObject({ nullIsland: 1, outside: 0 })
  })

  it('rejects a real place outside Peninsular Malaysia as outside', () => {
    // Kuching, in Borneo.
    const d = one({ ...ETS, position: { latitude: 1.55, longitude: 110.34 } })
    expect(d.rejected.outside).toBe(1)
    expect(d.vehicles).toEqual([])
  })

  it('rejects a report with no timestamp rather than aging it from the header', () => {
    const { timestamp: _, ...noTime } = ETS
    const d = one({ ...noTime, position: { latitude: 3.1, longitude: 101.7 } })
    expect(d.rejected.incomplete).toBe(1)
  })
})

describe('a body that cannot be read', () => {
  it('is a result, not a throw', () => {
    expect(decodeFeed(Uint8Array.from([0xff, 0xff, 0xff, 0x07, 0x42]), 'bus')).toEqual({ ok: false })
    expect(decodeFeed(new TextEncoder().encode('<html>429</html>'), 'bus')).toEqual({ ok: false })
  })

  it('an empty body has no header, so is unreadable rather than empty', () => {
    expect(decodeFeed(new Uint8Array(0), 'ktm')).toEqual({ ok: false })
  })
})

describe('mergeFixes', () => {
  const held1 = mergeFixes(new Map(), bus1.vehicles)
  const held2 = mergeFixes(held1, bus2.vehicles)

  it('moves the vehicles that reported again, and keeps the ones that did not', () => {
    const again = bus2.vehicles.filter((v) => held1.has(v.id))
    const moved = again.filter((v) => v.fixSec > held1.get(v.id)!.fixSec)
    expect(moved.length).toBeGreaterThan(0)
    for (const v of moved) expect(held2.get(v.id)).toBe(v)
    const silent = [...held1.keys()].filter((id) => !bus2.vehicles.some((v) => v.id === id))
    expect(silent.length).toBeGreaterThan(0)
    for (const id of silent) expect(held2.get(id)).toBe(held1.get(id))
  })

  it('changes nothing when the older response arrives again', () => {
    const again = mergeFixes(held2, bus1.vehicles)
    expect([...again.entries()]).toEqual([...held2.entries()])
    for (const [id, v] of again) expect(v).toBe(held2.get(id))
  })

  it('does not replace a report with one of the same age', () => {
    const v = bus1.vehicles[0]
    const twin: LiveVehicle = { ...v, position: [101, 3] }
    expect(mergeFixes(held1, [twin]).get(v.id)).toBe(v)
  })

  it('leaves a vehicle where it was when its next report is at 0,0', () => {
    const at = { latitude: 3.1, longitude: 101.7 }
    const first = ok(decodeFeed(feedOf({ ...ETS, position: at }), 'ktm'))
    const held = mergeFixes(new Map(), first.vehicles)
    const next = ok(
      decodeFeed(
        feedOf({ ...ETS, timestamp: ETS.timestamp + 120, position: { latitude: 0, longitude: 0 } }),
        'ktm',
      ),
    )
    expect(next.rejected.nullIsland).toBe(1)
    const after = mergeFixes(held, next.vehicles)
    expect(after.get('9999')?.position).toEqual([expect.closeTo(101.7, 4), expect.closeTo(3.1, 4)])
    expect(after.get('9999')?.fixSec).toBe(ETS.timestamp)
  })

  it('does not touch the map it was given', () => {
    const before = new Map(held1)
    mergeFixes(held1, bus2.vehicles)
    expect(held1).toEqual(before)
  })
})

describe('ageSec and freshness', () => {
  const fix = 1790309287
  const at = (sec: number) => (fix + sec) * 1000

  it('45 s is fresh, 241 s stale, 601 s gone', () => {
    expect(ageSec(fix, at(45))).toBe(45)
    expect(freshness(fix, at(45))).toBe('fresh')
    expect(freshness(fix, at(240))).toBe('fresh')
    expect(freshness(fix, at(241))).toBe('stale')
    expect(freshness(fix, at(600))).toBe('stale')
    expect(freshness(fix, at(601))).toBe('gone')
  })

  it('a report 3 s in the future is 0 s old, never negative', () => {
    expect(ageSec(fix, at(-3))).toBe(0)
    expect(freshness(fix, at(-3))).toBe('fresh')
  })

  it('dropGone removes only what is past ten minutes, and returns the same map when nothing goes', () => {
    const held = mergeFixes(new Map(), bus1.vehicles)
    const newest = Math.max(...bus1.vehicles.map((v) => v.fixSec))
    expect(dropGone(held, newest * 1000)).toBe(held)
    expect(dropGone(held, (newest + 601) * 1000).size).toBe(0)
  })
})

describe('due', () => {
  const never = { bus: -Infinity, ktm: -Infinity }

  it('asks for the bus feed first, and KTM 30 s after it', () => {
    expect(due('bus', 0, never)).toBe(true)
    const last = { bus: 0, ktm: -Infinity }
    expect(due('ktm', STAGGER_MS - 1, last)).toBe(false)
    expect(due('ktm', STAGGER_MS, last)).toBe(true)
  })

  it('asks for each feed at most once a minute', () => {
    const last = { bus: 0, ktm: STAGGER_MS }
    expect(due('bus', POLL_MS - 1, last)).toBe(false)
    expect(due('bus', POLL_MS, last)).toBe(true)
    expect(due('ktm', STAGGER_MS + POLL_MS - 1, last)).toBe(false)
  })

  it('never asks within 30 s of the other feed, even after a long pause', () => {
    const last = { bus: 0, ktm: 500_000 }
    expect(due('bus', 500_000 + STAGGER_MS - 1, last)).toBe(false)
  })
})
