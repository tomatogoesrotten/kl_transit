import type {
  DayType,
  Direction,
  HeadwayWindow,
  Line,
  Network,
  Origin,
  PreparedDirection,
  PreparedLine,
  PreparedNetwork,
} from './types'

const DAY_TYPES: readonly DayType[] = ['MonFri', 'Sat', 'Sun']

/** "a train every N seconds from A to B" -> the actual departure seconds. End-exclusive. */
function expand(windows: HeadwayWindow[]): number[] {
  const deps: number[] = []
  for (const [start, end, headway] of windows) {
    for (let t = start; t < end; t += headway) deps.push(t)
  }
  return deps
}

function prepareDirection(dir: Direction): PreparedDirection {
  const deps: Partial<Record<DayType, number[]>> = {}
  for (const svc of DAY_TYPES) {
    const windows = dir.headways[svc]
    if (windows) deps[svc] = expand(windows)
  }
  return { ...dir, duration: dir.stops[dir.stops.length - 1].dep, deps }
}

function prepareLine(line: Line, origin: Origin): PreparedLine {
  // Track geometry in local metres: x = east, z = south (so north is -z).
  const n = line.path.length
  const xs = new Float64Array(n)
  const zs = new Float64Array(n)
  const cum = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    xs[i] = (line.path[i][0] - origin.lon) * origin.kx
    zs[i] = -(line.path[i][1] - origin.lat) * origin.ky
    if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1])
  }
  return {
    ...line,
    directions: line.directions.map(prepareDirection),
    origin,
    xs,
    zs,
    cum,
    total: cum[n - 1],
  }
}

/**
 * Derive the track geometry and departure times the simulation needs.
 *
 * Returns a new network rather than adding fields to the one it is given:
 * data/network.json is an ES module import, so every caller shares one object.
 */
export function prepare(net: Network): PreparedNetwork {
  return { ...net, lines: net.lines.map((line) => prepareLine(line, net.origin)) }
}
