import { pointAt } from './sim'
import type { Place, PreparedLine, PreparedNetwork } from './types'

/**
 * Group the feed's per-line stops into places: one per station name.
 *
 * The feed gives every line its own stop id at an interchange (KL Sentral is
 * KJ15 and MR1), and only the name says they are one station. Proximity cannot
 * stand in for it: in this feed two stops sharing a name can lie further apart
 * than two different stations do. So the key is the exact name, as normalised
 * by build_network_json.py, and scripts/check_feed.py guards that assumption.
 *
 * Call it once and hold on to the result. It does not change the network.
 */
export function places(net: PreparedNetwork): Place[] {
  // Walk the timetable, not stations[id].line (which copies stops.route_id).
  // Direction 0 visits every stop of its line, so this also fixes the order.
  const onLine = new Map<string, { line: PreparedLine; at: number; reversed: boolean }>()
  for (const line of net.lines) {
    const dir = line.directions[0]
    for (const stop of dir.stops) {
      if (!onLine.has(stop.id)) onLine.set(stop.id, { line, at: stop.at, reversed: dir.reversed })
    }
  }

  const byName = new Map<string, string[]>()
  for (const id of onLine.keys()) {
    const name = net.stations[id].name
    byName.set(name, [...(byName.get(name) ?? []), id])
  }
  // A station no timetable calls at would have no line and no position. Say so
  // rather than quietly leaving it out.
  for (const id of Object.keys(net.stations)) {
    if (!onLine.has(id)) throw new Error(`places: station ${id} is not on any line's direction 0`)
  }

  const { origin } = net
  const result: Place[] = []
  for (const [name, stops] of byName) {
    const points = stops.map((id) => {
      const s = onLine.get(id)!
      return pointAt(s.line, s.at, s.reversed)
    })

    // Published coordinates, in the network's flat projection (as prepare.ts
    // measures the track). Never haversine: a transfer would then be measured
    // differently from the track it joins.
    const transfers: Place['transfers'] = []
    for (let i = 0; i < stops.length; i++) {
      for (let j = i + 1; j < stops.length; j++) {
        const a = net.stations[stops[i]]
        const b = net.stations[stops[j]]
        const metres = Math.hypot((a.lon - b.lon) * origin.kx, (a.lat - b.lat) * origin.ky)
        transfers.push({ from: stops[i], to: stops[j], metres })
      }
    }

    result.push({
      id: name,
      name,
      stops,
      lines: [...new Set(stops.map((id) => onLine.get(id)!.line.id))],
      // Averaging lon/lat directly is exact: the flat projection is affine.
      lon: points.reduce((sum, p) => sum + p.lon, 0) / points.length,
      lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
      transfers,
    })
  }
  // Plain code-unit order, not localeCompare, so the order is the same on every machine.
  return result.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}
