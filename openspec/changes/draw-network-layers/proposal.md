# Proposal

## Why

There is a tilted 3D map of Kuala Lumpur (Milestone 1) and a simulation that knows where every train
is (Milestone 2), and nothing connects them. The map shows an empty city.

This change draws the network itself — the eight lines and their 187 stations — over the real city.
It is the first time the data becomes something a person can look at, and it puts in place the
rendering layer that Milestone 4's moving trains will plug straight into.

## What Changes

- Add deck.gl to the app, rendered over MapLibre in interleaved mode so layers sit correctly among
  the 3D building extrusions rather than floating above them.
- Draw each of the eight lines as a path in its official colour, at a width that stays readable from
  city-wide zoom down to street level.
- Draw each station as a small ring in its line's colour, positioned **on the track** using the
  simulation's `pointAt` and the station's recorded distance along the line.
- **BREAKING** (to the written plan, not to code): use `MapLibreOverlay` from `@deck.gl/maplibre`,
  not `MapboxOverlay` from `@deck.gl/mapbox`. `CLAUDE.md` and `GUIDE.md` both name `MapboxOverlay`
  and are now out of date. See design.md.
- Expose the overlay so that Milestone 4 can drive it with `overlay.setProps` from an animation
  loop, without React re-rendering.

## Capabilities

### New Capabilities

- `network-map`: showing the rail network on the map — the lines in their own colours, the stations
  on the track they serve, drawn among the city's buildings rather than pasted over them.

### Modified Capabilities

None. `train-simulation` gains no new requirements; this change consumes it.

## Impact

- **New code**: deck.gl layer construction and the overlay wiring, under `src/map/`.
- **Modified**: `src/map/MapView.tsx` gains the overlay. `src/App.tsx` may lose its placeholder
  caption if the map now speaks for itself — but the honesty line ("positions are scheduled, not
  live") stays visible somewhere.
- **No change** to `src/sim/`. This change is a consumer of it. If drawing turns out to need
  something the simulation does not expose, that is a separate change with its own spec delta.
- **Dependencies added**: `@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/maplibre`, all 9.4.0. Agreed
  with the owner. Individual packages rather than the umbrella `deck.gl`, to keep out layer families
  this project will never use. `npm audit` reports zero vulnerabilities after installing.
- **Documentation**: `CLAUDE.md` and `GUIDE.md` both need their `MapboxOverlay` references
  corrected, and a new ADR records why.
- **Downstream**: Milestone 4 adds trains to this overlay; Milestone 6 adds picking to these layers.
  The layer ids and the overlay's exposure are the contract they build on.

## Non-goals

- No trains and no animation. Milestone 4.
- No hovering, clicking, tooltips or cards. Milestone 6.
- No merging of interchange stations into single markers, and no offsetting of the Ampang and Sri
  Petaling lines where they share track. Both are listed in `GUIDE.md` as after-version-1 work, and
  both will look wrong until then — eleven stations from Sentul Timur to Chan Sow Lin will draw
  twice, once per line. That is honest to the data and is left visible rather than hidden.
