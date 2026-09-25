import bindings from 'gtfs-realtime-bindings'

/**
 * Live vehicles: Rapid KL buses and KTMB trains, where their GPS feeds last put
 * them.
 *
 * Pure, for the same reasons src/sim is: no clock, no DOM, no state held
 * between calls. Time comes in as an argument. `src/sim/purity.test.ts` scans
 * this file too.
 *
 * Deliberately NOT in src/sim. That module is "timetable in, positions out",
 * and the one line this code most needs to keep sharp is scheduled against
 * observed. Nothing here is scheduled.
 */

// A CommonJS module; the default import is its `module.exports`, which is what
// Vite and Vitest both hand back. Its namespace import holds only `default`.
const { FeedEntity, FeedHeader } = bindings.transit_realtime
type Entity = ReturnType<typeof FeedEntity.decode>

/** Internal names for the two feeds. They name the FEED, not what is in it - see `MODE_NAME`. */
export type LiveMode = 'bus' | 'ktm'

export const LIVE_MODES: readonly LiveMode[] = ['bus', 'ktm']

/**
 * What each mode is called wherever a person reads it. The one source of both
 * names, so the switch, the status, the hover and the card cannot disagree.
 *
 * "KTM ETS (intercity)" and not "KTM": every KTMB entity sampled on 2026-09-25
 * was an ETS intercity set (labels ETS301 to ETS310), and none was Komuter,
 * although Komuter runs in the Klang Valley all day. Called "KTM", an empty
 * Komuter line would read as a line with nothing running. If Komuter appears in
 * the feed, this and the sentence about it in App.tsx change together.
 */
export const MODE_NAME: Record<LiveMode, string> = {
  bus: 'Rapid KL bus',
  ktm: 'KTM ETS (intercity)',
}

/** The feeds, from Malaysia's official open API. No key; both send `Access-Control-Allow-Origin: *`. */
export const FEED_URL: Record<LiveMode, string> = {
  bus: 'https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana/?category=rapid-bus-kl',
  ktm: 'https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb/',
}

/**
 * Whether a mode's bearings are measurements.
 *
 * KTM's are not. Sampled 2026-09-25, 12:09 to 12:13 KL: every entity in every
 * response had bearing 0 and speed 90, and all nine shared one timestamp.
 * Drawing nine trains all pointing north would present a placeholder as fact,
 * so KTM decodes to no bearing at all. If KTM starts sending real bearings, this
 * is the one line to change - after a re-sample says so.
 */
const HAS_BEARING: Record<LiveMode, boolean> = { bus: true, ktm: false }

/** One vehicle's newest usable report. Speed is not decoded: see proposal.md. */
export interface LiveVehicle {
  mode: LiveMode
  /** `vehicle.id` - a licence plate for buses, a trip number for KTM. */
  id: string
  /** KTM's set, e.g. ETS304. Buses send none. */
  label: string | null
  /** Buses only. KTM sends none. */
  routeId: string | null
  tripId: string | null
  position: [lon: number, lat: number]
  /** Compass degrees, or null where the mode's bearings are placeholders. */
  bearing: number | null
  /** The report's own timestamp, epoch seconds. */
  fixSec: number
  /**
   * When this report reached us, epoch ms. Set by `mergeFixes`, not the
   * decoder, so the card can tell "the feed answered since, with nothing newer
   * for this bus" from "this report is the latest answer".
   */
  receivedMs?: number
}

/**
 * Reports that were not drawn, by why, for the latest response.
 *
 * `incomplete` is a report with no vehicle id or no timestamp. None was seen in
 * sampling. Without an id it cannot be told from any other vehicle, and without
 * a time it has no age; the header's timestamp is NOT a substitute, because it
 * is newer than the fix and would make the report look fresher than it is.
 */
export interface Rejected {
  missing: number
  nullIsland: number
  outside: number
  incomplete: number
}

export const NO_REJECTS: Rejected = { missing: 0, nullIsland: 0, outside: 0, incomplete: 0 }

export type Decoded =
  | { ok: true; headerSec: number | null; vehicles: LiveVehicle[]; rejected: Rejected }
  | { ok: false }

/**
 * Within this many degrees of 0,0 on both axes (about 11 km) is null island:
 * what an unset position decodes to. The KTM sample holds a train at
 * 0.0027, 0.0155. Checked on its own, not left to the box, so that it survives
 * the box ever being widened.
 */
const NULL_ISLAND_DEG = 0.1

/**
 * Peninsular Malaysia, with the KTM shuttle's Woodlands terminus in Singapore.
 * Neither operator runs anywhere else. A train in Johor is inside it and is
 * drawn in Johor - filtering to the Klang Valley would be deciding for the feed
 * where its trains ought to be.
 */
export const BOX = { minLat: 0.5, maxLat: 7.5, minLon: 99, maxLon: 105 }

/**
 * Presence, not value. The bindings put every field's default on the message
 * PROTOTYPE, so an absent string reads `""` and an absent number `0`: KTM sends
 * no route_id, and `trip.routeId` reads `""`. Only fields on the wire are own
 * properties, so asking for one is asking whether the feed said it.
 */
function has<T extends object>(o: T | null | undefined, key: keyof T): o is T {
  return o != null && Object.prototype.hasOwnProperty.call(o, key)
}

/** A string the feed actually sent, or null. An empty one is not a name either. */
function str<T extends object>(o: T | null | undefined, key: keyof T): string | null {
  if (!has(o, key)) return null
  const v = o[key]
  return typeof v === 'string' && v !== '' ? v : null
}

/** A protobuf varint at `at.i`, advancing it. Seconds-sized values fit a double exactly. */
function varint(b: Uint8Array, at: { i: number }): number {
  let n = 0
  for (let mul = 1; ; mul *= 128) {
    if (at.i >= b.length || mul > 2 ** 56) throw new Error('bad varint')
    const byte = b[at.i++]
    n += (byte & 0x7f) * mul
    if (byte < 0x80) return n
  }
}

/**
 * A FeedMessage's header and entities as separate byte ranges.
 *
 * Why not `FeedMessage.decode`: GTFS-Realtime makes latitude and longitude
 * REQUIRED, and the generated decoder throws on a position missing either -
 * which would throw away the whole response, every good vehicle in it, for one
 * bad report. Splitting the message first lets each entity fail alone, so a
 * missing coordinate is counted as `missing`, as the spec says it must be.
 */
function split(b: Uint8Array): { header: Uint8Array | null; entities: Uint8Array[] } {
  const at = { i: 0 }
  let header: Uint8Array | null = null
  const entities: Uint8Array[] = []
  while (at.i < b.length) {
    const tag = varint(b, at)
    const wire = tag % 8
    const field = Math.floor(tag / 8)
    if (wire === 0) varint(b, at)
    else if (wire === 1) at.i += 8
    else if (wire === 5) at.i += 4
    else if (wire === 2) {
      const len = varint(b, at)
      const body = b.subarray(at.i, at.i + len)
      at.i += len
      if (body.length !== len) throw new Error('truncated')
      if (field === 1) header = body
      else if (field === 2) entities.push(body)
    } else throw new Error(`wire type ${wire}`)
  }
  if (at.i !== b.length) throw new Error('truncated')
  return { header, entities }
}

/** Why a position cannot be drawn, or null when it can. */
function badPosition(lat: number, lon: number): keyof Rejected | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'missing'
  if (Math.abs(lat) < NULL_ISLAND_DEG && Math.abs(lon) < NULL_ISLAND_DEG) return 'nullIsland'
  if (lat < BOX.minLat || lat > BOX.maxLat || lon < BOX.minLon || lon > BOX.maxLon) return 'outside'
  return null
}

/**
 * A response body, as the vehicles in it that can be drawn and a count of the
 * reports that cannot.
 *
 * Never throws. A body that cannot be read is a condition of the feed
 * (`ok: false`), not an exception loose in the frame loop.
 */
export function decodeFeed(bytes: Uint8Array, mode: LiveMode): Decoded {
  let parts: ReturnType<typeof split>
  let headerSec: number | null
  try {
    parts = split(bytes)
    // The header is required. A message without one is not a feed message.
    if (!parts.header) return { ok: false }
    const header = FeedHeader.decode(parts.header)
    // `Number()`: timestamps are uint64, so they decode as `Long` objects.
    headerSec = has(header, 'timestamp') ? Number(header.timestamp) : null
  } catch {
    return { ok: false }
  }

  const vehicles: LiveVehicle[] = []
  const rejected = { ...NO_REJECTS }
  for (const body of parts.entities) {
    let e: Entity
    try {
      e = FeedEntity.decode(body)
    } catch (err) {
      // The one decode failure that is a single bad report rather than a bad
      // response. See `split`.
      if (/missing required '(latitude|longitude)'/.test(String(err))) {
        rejected.missing++
        continue
      }
      return { ok: false }
    }
    // Not a vehicle position at all (a trip update or an alert). These feeds
    // send none, and it is not a report of where anything is.
    if (!has(e, 'vehicle') || !e.vehicle) continue
    const v = e.vehicle
    if (!has(v, 'position') || !v.position) {
      rejected.missing++
      continue
    }
    const p = v.position
    const why = badPosition(p.latitude, p.longitude)
    if (why) {
      rejected[why]++
      continue
    }
    const id = str(v.vehicle, 'id')
    if (id === null || !has(v, 'timestamp')) {
      rejected.incomplete++
      continue
    }
    const bearing = HAS_BEARING[mode] && has(p, 'bearing') ? p.bearing : null
    vehicles.push({
      mode,
      id,
      label: str(v.vehicle, 'label'),
      routeId: str(v.trip, 'routeId'),
      tripId: str(v.trip, 'tripId'),
      position: [p.longitude, p.latitude],
      bearing: typeof bearing === 'number' && Number.isFinite(bearing) ? bearing : null,
      fixSec: Number(v.timestamp),
    })
  }
  return { ok: true, headerSec, vehicles, rejected }
}

/**
 * The held set with a response merged in: the newest report per vehicle.
 *
 * A held report is replaced only by a strictly newer one, so a late or repeated
 * response never moves a vehicle backwards. Rejected reports never get here,
 * which is why a vehicle held at a real position and next reported at 0,0
 * stays where it was. Returns a new map; `held` is not touched.
 *
 * @param receivedMs When the response arrived, epoch ms, recorded on each
 *   report that is taken in. A report kept from before keeps its own.
 */
export function mergeFixes(
  held: ReadonlyMap<string, LiveVehicle>,
  vehicles: readonly LiveVehicle[],
  receivedMs: number,
): Map<string, LiveVehicle> {
  const out = new Map(held)
  for (const v of vehicles) {
    const had = out.get(v.id)
    if (!had || v.fixSec > had.fixSec) out.set(v.id, { ...v, receivedMs })
  }
  return out
}

/**
 * Stale at 4 minutes, gone at 10. From the 2026-09-25 midday sample, polling
 * each feed once a minute: a bus fix arrives up to ~140 s old and the next
 * poll comes up to 60 s later, so a normally reporting bus peaks near 200 s.
 * 240 s is just above that - past it, the vehicle has missed a report it would
 * ordinarily have sent. 600 s lets a bus come back through a GPS shadow rather
 * than blink out, and still clears a bus that ended its shift within minutes.
 * See design.md, "Thresholds".
 */
export const STALE_S = 240
export const GONE_S = 600

/**
 * How old a report is, in seconds, from its own timestamp. Never negative: a
 * report slightly in the future means somebody's clock is off (the sampling
 * machine's ran 3 s behind the server), and it is treated as just received.
 */
export function ageSec(fixSec: number, nowMs: number): number {
  return Math.max(0, nowMs / 1000 - fixSec)
}

export type Freshness = 'fresh' | 'stale' | 'gone'

export function freshness(fixSec: number, nowMs: number): Freshness {
  const age = ageSec(fixSec, nowMs)
  return age > GONE_S ? 'gone' : age > STALE_S ? 'stale' : 'fresh'
}

/** The held set without the reports that are too old to draw. Returns `held` itself when nothing went. */
export function dropGone(
  held: ReadonlyMap<string, LiveVehicle>,
  nowMs: number,
): ReadonlyMap<string, LiveVehicle> {
  let out: Map<string, LiveVehicle> | null = null
  for (const [id, v] of held) {
    if (freshness(v.fixSec, nowMs) !== 'gone') continue
    out ??= new Map(held)
    out.delete(id)
  }
  return out ?? held
}

/**
 * How often each feed is asked for. Buses every 30 s: the bus feed itself
 * changes only every 60 to 80 s, so this picks a new report up sooner - which
 * matters now that a report corrects a moving estimate - but does not make any
 * report fresher. KTM every 120 s, which is how often its fixes change.
 *
 * With `MIN_GAP_MS` that is 2.5 requests a minute, and never more than 3 in any
 * 60 s, against the documented GTFS Realtime limit of 4 (429 beyond it): room
 * for a reload, a second tab or React's development double-mount.
 */
export const POLL_MS: Record<LiveMode, number> = { bus: 30_000, ktm: 120_000 }

/** And never within 10 s of the OTHER feed's request, so the two never land together. */
export const MIN_GAP_MS = 10_000

/**
 * Whether a mode's feed may be requested now, as far as timing goes. The caller
 * also checks that the page is visible, the clock live, the mode on and nothing
 * already in flight.
 *
 * @param last When each feed was last requested, ms on any one monotonic clock.
 */
export function due(mode: LiveMode, nowMs: number, last: Readonly<Record<LiveMode, number>>) {
  const other: LiveMode = mode === 'bus' ? 'ktm' : 'bus'
  return nowMs - last[mode] >= POLL_MS[mode] && nowMs - last[other] >= MIN_GAP_MS
}

/**
 * Milliseconds until a mode's feed is next due, never negative: 0 when it is
 * due now, or has never been asked for. For the card's countdown to the next
 * CHECK - which is not the next report; half the bus checks bring nothing new.
 */
export function untilDue(mode: LiveMode, nowMs: number, last: Readonly<Record<LiveMode, number>>) {
  return Math.max(0, last[mode] + POLL_MS[mode] - nowMs)
}
