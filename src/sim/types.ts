// The shape of data/network.json, plus what the simulation derives from it.
// Coordinates are [lon, lat]; distances are metres; times are seconds.

export type DayType = 'MonFri' | 'Sat' | 'Sun'
export type Mode = 'LRT' | 'MRT' | 'MRL' | 'BRT'

export type LonLat = [lon: number, lat: number]

/** "between startSec and endSec, a train every everySec". End-exclusive. */
export type HeadwayWindow = [startSec: number, endSec: number, everySec: number]

/** The network's own flat projection: x = (lon - origin.lon) * kx east, z = -(lat - origin.lat) * ky south. */
export interface Origin {
  lat: number
  lon: number
  kx: number
  ky: number
}

export interface Stop {
  id: string
  /** Seconds after the trip started, at which the train reaches this stop. */
  arr: number
  /** Seconds after the trip started, at which it leaves again. */
  dep: number
  /** Metres along the line's path, at the point the stop was projected onto. */
  at: number
}

export interface Direction {
  dir: 0 | 1
  to: string
  /** True when this direction runs backwards along the stored path. */
  reversed: boolean
  stops: Stop[]
  headways: Record<DayType, HeadwayWindow[]>
}

export interface Line {
  id: string
  code: string
  name: string
  mode: Mode
  color: string
  length_m: number
  path: LonLat[]
  directions: Direction[]
}

export interface Station {
  name: string
  full: string
  lon: number
  lat: number
  line: string
}

export interface Network {
  origin: Origin
  generated_from: string
  lines: Line[]
  stations: Record<string, Station>
}

export interface PreparedDirection extends Direction {
  /** Seconds from leaving the origin terminal to leaving the last stop. */
  duration: number
  /** Headway windows expanded into departure seconds. Partial: a feed may drop a day type. */
  deps: Partial<Record<DayType, number[]>>
}

/**
 * A path in the network's flat projection: everything `pointAt` reads. A rail
 * line is one; so is a bus route shape (src/live/busdata.ts), prepared the same
 * way so that the one function turns metres along either into a position.
 */
export interface Path {
  /** Copied from the network so pointAt can invert the projection without module state. */
  origin: Origin
  /** Path vertices in local metres, and the running distance along them. */
  xs: Float64Array
  zs: Float64Array
  cum: Float64Array
  total: number
}

export interface PreparedLine extends Omit<Line, 'directions'>, Path {
  directions: PreparedDirection[]
}

export interface PreparedNetwork extends Omit<Network, 'lines'> {
  lines: PreparedLine[]
}

export interface Progress {
  /** Metres along the line's path, measured in the stored direction. */
  at: number
  dwelling: boolean
  /** Index into the direction's stops: the one it is at, or the one it is heading for. */
  stop: number
  /** Seconds until it departs (dwelling) or arrives (moving). */
  secs: number
}

export interface ActiveTrain extends Progress {
  line: PreparedLine
  dir: PreparedDirection
  /** The departure second within its own service day, un-shifted. */
  dep: number
  id: string
}

export interface Point {
  lon: number
  lat: number
  /** Compass bearing: 0 = north, 90 = east, clockwise, 0 <= bearingDeg < 360. */
  bearingDeg: number
}

/** Kuala Lumpur wall clock, as plain numbers. See clock.ts for why it is not a Date. */
export interface KlTime {
  year: number
  /** 1 = January. */
  month: number
  day: number
  /** 0 = Sunday. */
  dow: number
  /** Seconds after KL midnight, fractional. */
  sec: number
  today: DayType
  yesterday: DayType
}

/** One physical station: every per-line stop that carries the same name. See places.ts. */
export interface Place {
  /** The name itself: unique among places by construction, stable while the feed keeps the name. */
  id: string
  name: string
  /** Stop ids, in network line order, then each line's direction-0 stop order. */
  stops: string[]
  /** Ids of the lines whose timetable calls at one of the stops, in network line order. */
  lines: string[]
  /** The mean of the stops' points on the track: the true alignment, without any drawn offset. */
  lon: number
  lat: number
  /** Straight-line metres between every unordered pair of stops, from published coordinates. */
  transfers: { from: string; to: string; metres: number }[]
}
