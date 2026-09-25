import type { Place } from '../sim'

/**
 * A name as a person might type it: accents, case, spaces, hyphens and
 * apostrophes all dropped. So "sunway setia" finds "Sunway-Setia Jaya", and an
 * accented name a future refresh brings is found without typing the accent.
 */
export function normaliseName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\s\-'’]/g, '')
}

/**
 * Places whose name matches the query: names starting with it first, then
 * names merely containing it, each group in name order. An empty query finds
 * nothing, so the panel goes on showing its line rows.
 */
export function findPlaces(places: readonly Place[], query: string, limit = 8): Place[] {
  const q = normaliseName(query)
  if (!q) return []
  const starts: Place[] = []
  const contains: Place[] = []
  for (const place of places) {
    const name = normaliseName(place.name)
    if (name.startsWith(q)) starts.push(place)
    else if (name.includes(q)) contains.push(place)
  }
  const byName = (a: Place, b: Place) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  return [...starts.sort(byName), ...contains.sort(byName)].slice(0, limit)
}

/** Just what `firstShownStop` reads of a line. */
interface LineStops {
  id: string
  directions: readonly { dir: number; stops: readonly { id: string }[] }[]
}

/**
 * The first of a place's stops on a line that is shown, with its line, or
 * undefined when every line serving it is hidden: there is nothing drawn to go to.
 *
 * The line comes from the timetable, never `stations[id].line`, which copies
 * the feed's unreliable `stops.route_id`.
 */
export function firstShownStop(
  place: Place,
  lines: readonly LineStops[],
  hidden: ReadonlySet<string>,
): { lineId: string; stopId: string } | undefined {
  for (const stopId of place.stops) {
    const line = lines.find((l) =>
      l.directions.find((d) => d.dir === 0)?.stops.some((s) => s.id === stopId),
    )
    if (line && !hidden.has(line.id)) return { lineId: line.id, stopId }
  }
  return undefined
}
