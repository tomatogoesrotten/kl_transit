import { describe, expect, it } from 'vitest'
import { PLACES, rail } from '../rail'
import type { Place } from '../sim'
import { findPlaces, firstShownStop, normaliseName } from './search'

const names = (list: Place[]) => list.map((p) => p.name)

describe('normaliseName', () => {
  it('drops case, spaces, hyphens, apostrophes and accents', () => {
    expect(normaliseName("Sunway-Setia Jaya")).toBe('sunwaysetiajaya')
    expect(normaliseName("Dato' Keramat")).toBe('datokeramat')
    expect(normaliseName('Café')).toBe('cafe')
  })
})

describe('findPlaces', () => {
  it('finds a name without its punctuation', () => {
    expect(names(findPlaces(PLACES, 'sunway setia'))).toContain('Sunway-Setia Jaya')
  })

  it('lists an interchange once', () => {
    expect(names(findPlaces(PLACES, 'titi'))).toEqual(['Titiwangsa'])
  })

  it('puts a prefix match before a contains match', () => {
    // "Ab Kajang" sorts first by name, but only contains the query.
    const made = [{ name: 'Ab Kajang' }, { name: 'Kajang' }] as Place[]
    expect(names(findPlaces(made, 'kajang'))).toEqual(['Kajang', 'Ab Kajang'])
  })

  it('finds an unaccented name from an accented query', () => {
    expect(names(findPlaces(PLACES, 'Ímbi'))).toEqual(['Imbi'])
  })

  it('finds nothing for an empty query, and at most the limit', () => {
    expect(findPlaces(PLACES, '  ')).toEqual([])
    expect(findPlaces(PLACES, 'a').length).toBe(8)
  })
})

describe('firstShownStop', () => {
  const titi = PLACES.find((p) => p.name === 'Titiwangsa')!

  it('skips hidden lines', () => {
    const first = firstShownStop(titi, rail.lines, new Set())!
    expect(first.stopId).toBe(titi.stops[0])
    const next = firstShownStop(titi, rail.lines, new Set([first.lineId]))!
    expect(next.lineId).not.toBe(first.lineId)
    expect(titi.stops).toContain(next.stopId)
  })

  it('returns nothing when every line is hidden', () => {
    expect(firstShownStop(titi, rail.lines, new Set(titi.lines))).toBeUndefined()
  })
})
