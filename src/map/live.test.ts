import { describe, expect, it } from 'vitest'
import { network } from '../sim'
import type { LiveVehicle } from '../live/feed'
import type { LiveFeed, LiveFeeds } from '../ui/store'
import { hexToRgb } from './layers'
import type { BusStop } from '../live/busdata'
import { IconLayer } from '@deck.gl/layers'
import { ScenegraphLayer } from '@deck.gl/mesh-layers'
import {
  angleFor,
  BUS_VIEW_RAIL_OPACITY,
  busStopLayers,
  LIVE_STYLE,
  liveItems,
  liveKind,
  liveLayers,
  staleRgb,
  STOP_MIN_ZOOM,
  stopsShown,
} from './live'
import { MODEL_W, yawFor } from './trains'

const NOW = 1_790_309_400_000

function bus(id: string, ageS: number): LiveVehicle {
  return {
    mode: 'bus',
    id,
    label: null,
    routeId: 'U6000',
    tripId: 't',
    position: [101.7, 3.1],
    bearing: 90,
    fixSec: NOW / 1000 - ageS,
  }
}

function feed(vehicles: LiveVehicle[], version: number): LiveFeed {
  return {
    held: new Map(vehicles.map((v) => [v.id, v])),
    version,
    status: { state: 'ok', lastOkMs: NOW, rejected: { missing: 0, nullIsland: 0, outside: 0, incomplete: 0 } },
  }
}

const store = (b: LiveFeed): LiveFeeds => ({ bus: b, ktm: feed([], 0) })

function ets(id: string, ageS: number): LiveVehicle {
  return { ...bus(id, ageS), mode: 'ktm', routeId: '', bearing: null }
}

/** What a layer's `getColor` gives its first item. */
const colourOf = (l: { props: { getColor?: unknown; data?: unknown } }) =>
  (l.props.getColor as (d: unknown) => number[])((l.props.data as unknown[])[0])

describe('LIVE_STYLE', () => {
  it.each(['city', 'wireframe'] as const)(
    'gives neither live mode a colour any rail line uses, in the %s view',
    (view) => {
      const lines = network.lines.map((l) => hexToRgb(l.color).join())
      const { bus, ktm } = LIVE_STYLE.color[view]
      expect(lines).not.toContain(bus.join())
      expect(lines).not.toContain(ktm.join())
      expect(bus.join()).not.toBe(ktm.join())
    },
  )

  it('draws buses light on the dark wireframe and dark on the pale city', () => {
    // Mean channel as a rough brightness. The bug this guards: one dark slate
    // for both views, which vanished against the wireframe's near-black ground.
    const lum = ([r, g, b]: readonly number[]) => (r + g + b) / 3
    expect(lum(LIVE_STYLE.color.city.bus)).toBeLessThan(128)
    expect(lum(LIVE_STYLE.color.wireframe.bus)).toBeGreaterThan(128)
  })
})

describe('angleFor', () => {
  // IconLayer turns an icon anticlockwise for a positive angle; see the
  // comment on `angleFor` for where that was read from.
  it('leaves a bus heading north unturned', () => {
    expect(angleFor(0)).toBe(0)
  })

  it('turns a bus heading east a quarter turn clockwise, which is 270 anticlockwise', () => {
    expect(angleFor(90)).toBe(270)
    expect(angleFor(270)).toBe(90)
  })
})

describe('liveItems', () => {
  it('draws fresh and stale reports, marks the stale ones, and leaves out the gone', () => {
    const held = feed([bus('A', 45), bus('B', 241), bus('C', 601)], 1).held
    const { items } = liveItems(held, 1, NOW)
    expect(items.map((d) => [d.v.id, d.stale])).toEqual([
      ['A', false],
      ['B', true],
    ])
  })
})

describe('liveLayers, the rebuild decision', () => {
  const frames = () => liveLayers('label')

  it('hands back the same instance while nothing visible changed', () => {
    const draw = frames()
    const s = store(feed([bus('A', 45)], 1))
    const [first] = draw(s, new Set(), NOW, 12, 'city', 'rail', 4)
    expect(draw(s, new Set(), NOW + 16, 12, 'city', 'rail', 4)[0]).toBe(first)
    // Past the quarter-second re-check, but still nothing crossed a threshold.
    expect(draw(s, new Set(), NOW + 1000, 12.05, 'city', 'rail', 4)[0]).toBe(first)
  })

  it('rebuilds for a new response', () => {
    const draw = frames()
    const [first] = draw(store(feed([bus('A', 45)], 1)), new Set(), NOW, 12, 'city', 'rail', 4)
    expect(draw(store(feed([bus('A', 5)], 2)), new Set(), NOW + 16, 12, 'city', 'rail', 4)[0]).not.toBe(first)
  })

  it('rebuilds when a vehicle turns stale between responses', () => {
    const draw = frames()
    const s = store(feed([bus('A', 230)], 1))
    const [first] = draw(s, new Set(), NOW, 12, 'city', 'rail', 4)
    const [later] = draw(s, new Set(), NOW + 11_000, 12, 'city', 'rail', 4)
    expect(later).not.toBe(first)
    expect((later.props.data as { stale: boolean }[])[0].stale).toBe(true)
  })

  it('rebuilds when the zoom moves a band, not for every fraction', () => {
    const draw = frames()
    const s = store(feed([bus('A', 45)], 1))
    const [first] = draw(s, new Set(), NOW, 12, 'city', 'rail', 4)
    expect(draw(s, new Set(), NOW + 16, 12.1, 'city', 'rail', 4)[0]).toBe(first)
    expect(draw(s, new Set(), NOW + 32, 13, 'city', 'rail', 4)[0]).not.toBe(first)
  })

  it('never hands back an instance deck.gl finalized while its mode was left out', () => {
    // The bug this guards: switching a mode off and on, or leaving live and
    // pressing Now, returned the old instance. deck.gl had finalized it when it
    // left the list, and failed an assertion re-initializing it.
    const draw = frames()
    const s = store(feed([bus('A', 45)], 1))
    const [first] = draw(s, new Set(), NOW, 12, 'city', 'rail', 4)
    expect(draw(s, new Set(['bus', 'ktm']), NOW + 16, 12, 'city', 'rail', 4)).toEqual([])
    const [back] = draw(s, new Set(), NOW + 32, 12, 'city', 'rail', 4)
    expect(back).not.toBe(first)
    expect(back.id).toBe('live-bus')
  })

  it('rebuilds in the new colour when the map view changes', () => {
    const draw = frames()
    const s = store(feed([bus('A', 45)], 1))
    const [first] = draw(s, new Set(), NOW, 12, 'city', 'rail', 4)
    const [later] = draw(s, new Set(), NOW + 16, 12, 'wireframe', 'rail', 4)
    expect(later).not.toBe(first)
    const colour = (l: typeof later) =>
      (l.props.getColor as unknown as (d: unknown) => number[])((l.props.data as unknown[])[0]).slice(0, 3)
    expect(colour(later)).toEqual(LIVE_STYLE.color.wireframe.bus)
    expect(colour(first)).toEqual(LIVE_STYLE.color.city.bus)
  })

  it('leaves out a mode that is switched off, and puts buses before KTM', () => {
    const draw = frames()
    const s = store(feed([bus('A', 45)], 1))
    expect(draw(s, new Set(), NOW, 12, 'city', 'rail', 4).map((l) => l.id)).toEqual(['live-bus', 'live-ktm-model'])
    expect(draw(s, new Set(['bus']), NOW, 12, 'city', 'rail', 4).map((l) => l.id)).toEqual(['live-ktm-model'])
  })
})

describe('bus stops, the zoom and view gate', () => {
  const stops: BusStop[] = [['1005840', 'STESEN BRT SETIA JAYA', 101.61224, 3.08286]]

  it('draws stops only in the bus view, from zoom 14', () => {
    expect(STOP_MIN_ZOOM).toBe(14)
    expect(stopsShown('bus', 14)).toBe(true)
    expect(stopsShown('bus', 17)).toBe(true)
    expect(stopsShown('bus', 13.99)).toBe(false)
    expect(stopsShown('rail', 14)).toBe(false)
    expect(stopsShown('rail', 17)).toBe(false)
  })

  it('has no layer before the stops arrive', () => {
    expect(busStopLayers('label')(null, 'city', 'bus', 15)).toBeNull()
  })

  it('gates by visibility, and hands back the same instance while nothing crosses the gate', () => {
    const draw = busStopLayers('label')
    const far = draw(stops, 'city', 'bus', 12)!
    expect(far.props.visible).toBe(false)
    expect(draw(stops, 'city', 'bus', 13.5)).toBe(far)
    const near = draw(stops, 'city', 'bus', 14.2)!
    expect(near).not.toBe(far)
    expect(near.props.visible).toBe(true)
    expect(draw(stops, 'city', 'bus', 16)).toBe(near)
    const rail = draw(stops, 'city', 'rail', 16)!
    expect(rail.props.visible).toBe(false)
    expect(rail.id).toBe('bus-stops')
    expect(rail.props.pickable).toBe(true)
  })

  it('rebuilds in the other colours when the map style changes', () => {
    const draw = busStopLayers('label')
    const city = draw(stops, 'city', 'bus', 15)!
    const wire = draw(stops, 'wireframe', 'bus', 15)!
    expect(wire).not.toBe(city)
    expect(wire.props.getFillColor).toEqual(LIVE_STYLE.stop.wireframe.fill)
    expect(city.props.getFillColor).toEqual(LIVE_STYLE.stop.city.fill)
  })
})

describe('liveLayers, which layer each view builds', () => {
  const both = (): LiveFeeds => ({ bus: feed([bus('A', 45)], 1), ktm: feed([ets('E', 45)], 1) })

  it('draws buses as arrows in the rail view and as models in the bus view; ETS as a model in both', () => {
    expect(liveKind('bus', 'rail')).toBe('icon')
    expect(liveKind('bus', 'bus')).toBe('model')
    expect(liveKind('ktm', 'rail')).toBe('model')
    expect(liveKind('ktm', 'bus')).toBe('model')

    const draw = liveLayers('label')
    const [railBus, railKtm] = draw(both(), new Set(), NOW, 12, 'city', 'rail', 40)
    expect(railBus).toBeInstanceOf(IconLayer)
    expect(railBus.id).toBe('live-bus')
    expect(railKtm).toBeInstanceOf(ScenegraphLayer)
    expect(railKtm.id).toBe('live-ktm-model')

    const [busBus, busKtm] = draw(both(), new Set(), NOW + 16, 12, 'city', 'bus', 40)
    expect(busBus).toBeInstanceOf(ScenegraphLayer)
    // Its own id: deck.gl matches layers by id, and must never hand the arrow
    // layer's state to a model layer.
    expect(busBus.id).toBe('live-bus-model')
    expect(busKtm.id).toBe('live-ktm-model')
  })

  it('dims ETS with the rail network in the bus view, and never the buses', () => {
    const draw = liveLayers('label')
    const [, railKtm] = draw(both(), new Set(), NOW, 12, 'city', 'rail', 40)
    expect(railKtm.props.opacity).toBe(1)
    const [busBus, busKtm] = draw(both(), new Set(), NOW + 16, 12, 'city', 'bus', 40)
    expect(busBus.props.opacity).toBe(1)
    expect(busKtm.props.opacity).toBe(BUS_VIEW_RAIL_OPACITY)
  })

  it('never hands back an arrow layer deck.gl finalized while the bus view was shown', () => {
    const draw = liveLayers('label')
    const s = both()
    const [arrows] = draw(s, new Set(), NOW, 12, 'city', 'rail', 40)
    draw(s, new Set(), NOW + 16, 12, 'city', 'bus', 40)
    const [back] = draw(s, new Set(), NOW + 32, 12, 'city', 'rail', 40)
    expect(back.id).toBe('live-bus')
    expect(back).not.toBe(arrows)
  })

  it('forgets a model layer while its mode is off, as it does the arrows', () => {
    const draw = liveLayers('label')
    const s = both()
    const [first] = draw(s, new Set(), NOW, 12, 'city', 'bus', 40)
    expect(draw(s, new Set(['bus', 'ktm']), NOW + 16, 12, 'city', 'bus', 40)).toEqual([])
    const [back] = draw(s, new Set(), NOW + 32, 12, 'city', 'bus', 40)
    expect(back.id).toBe('live-bus-model')
    expect(back).not.toBe(first)
  })

  it('scales models like the trains, following W without regenerating anything', () => {
    const draw = liveLayers('label')
    const s = both()
    const [first] = draw(s, new Set(), NOW, 12, 'city', 'bus', 40)
    expect(first.props.sizeScale).toBe(40 / MODEL_W)
    expect(draw(s, new Set(), NOW + 16, 12, 'city', 'bus', 40)[0]).toBe(first)
    const [zoomed] = draw(s, new Set(), NOW + 32, 12.3, 'city', 'bus', 30)
    expect(zoomed).not.toBe(first)
    expect(zoomed.props.sizeScale).toBe(30 / MODEL_W)
    // A clone: same data and accessors, so deck.gl regenerates no attribute.
    expect(zoomed.props.data).toBe(first.props.data)
    expect(zoomed.props.getColor).toBe(first.props.getColor)
  })

  it('turns a bus model to its bearing, and leaves ETS unturned', () => {
    const draw = liveLayers('label')
    const [busModel, ktmModel] = draw(both(), new Set(), NOW, 12, 'city', 'bus', 40) as ScenegraphLayer[]
    const orient = busModel.props.getOrientation as unknown as (d: unknown) => number[]
    expect(orient((busModel.props.data as unknown[])[0])).toEqual([0, yawFor(90), 0])
    // The default constant: ETS bearings are placeholders.
    expect(typeof ktmModel.props.getOrientation).not.toBe('function')
  })

  it('draws a fresh model opaque in its colour, and a stale one fainter and greyer', () => {
    const draw = liveLayers('label')
    const s: LiveFeeds = { bus: feed([bus('A', 300)], 1), ktm: feed([ets('E', 45)], 1) }
    const [staleBus, freshKtm] = draw(s, new Set(), NOW, 12, 'wireframe', 'bus', 40)
    expect(colourOf(freshKtm)).toEqual([...LIVE_STYLE.color.wireframe.ktm, 255])
    const grey = staleRgb(LIVE_STYLE.color.wireframe.bus)
    expect(colourOf(staleBus)).toEqual([...grey, LIVE_STYLE.alpha.stale])
    expect(grey).not.toEqual(LIVE_STYLE.color.wireframe.bus)
  })
})

describe('staleRgb', () => {
  it('moves a colour part of the way to mid grey, from either side', () => {
    const t = LIVE_STYLE.model.staleGrey
    expect(staleRgb([228, 28, 128])).toEqual([Math.round(228 - 100 * t), Math.round(28 + 100 * t), 128])
    expect(staleRgb([128, 128, 128])).toEqual([128, 128, 128])
  })
})
