import { describe, expect, it } from 'vitest'
import { arrivalZoom, panelPadding, STATION_ZOOM } from './camera'

describe('panelPadding', () => {
  it('is the height the panels actually cover', () => {
    expect(panelPadding(800, 210)).toBe(210)
  })

  it('is nothing when the panels cover nothing', () => {
    expect(panelPadding(800, 0)).toBe(0)
  })

  it('never goes negative, however the measurement came out', () => {
    expect(panelPadding(800, -40)).toBe(0)
  })

  it('never takes more than half the viewport, or there is nothing to centre in', () => {
    // A phone held sideways: 360 px tall, and the panels are most of it.
    expect(panelPadding(360, 300)).toBe(180)
  })

  it('is a whole number of pixels', () => {
    expect(panelPadding(801, 900)).toBe(401)
  })

  it('is nothing before the map has been laid out', () => {
    expect(panelPadding(0, 210)).toBe(0)
  })
})

describe('arrivalZoom', () => {
  it('zooms in when the viewer is looking at the whole city', () => {
    // The map opens at 12.5, where a station is a dot among two hundred.
    expect(arrivalZoom(12.5)).toBe(STATION_ZOOM)
  })

  it('leaves the zoom alone when the viewer is already closer', () => {
    expect(arrivalZoom(17)).toBe(17)
  })

  it('does not move at the threshold itself', () => {
    expect(arrivalZoom(STATION_ZOOM)).toBe(STATION_ZOOM)
  })
})
