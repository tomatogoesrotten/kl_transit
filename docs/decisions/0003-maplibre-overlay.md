# 0003. MapLibreOverlay, not MapboxOverlay

Status: Accepted
Date: 2026-09-19

Closes the open risk recorded in [0001](0001-maplibre-v6-and-direct-json-import.md).

## Context

ADR 0001 took `maplibre-gl` v6 over v5 because v5 and below carry a critical XSS advisory
(GHSA-jrc7-96c5-q579) with no patched v5. It recorded a consequence to check before Milestone 3:

> deck.gl adds deck.gl on top of MapLibre through `MapboxOverlay` in interleaved mode, and deck.gl's
> MapLibre support has historically tracked v4 and v5. Before writing that code, check that the
> installed deck.gl release supports maplibre-gl v6. If it doesn't, the choice is between waiting
> for a deck.gl release, pinning an older MapLibre and accepting the advisory, or drawing without
> interleaving.

Checked. None of those three unhappy paths is needed — but the class named in the plan is wrong.

`CLAUDE.md` and `GUIDE.md` both said to use `MapboxOverlay` from `@deck.gl/mapbox`. That was correct
advice when the plan was written and is now out of date.

The evidence, from the packages themselves rather than from documentation:

| Package | `maplibre-gl` peer dependency |
|---|---|
| `@deck.gl/mapbox` 9.4.0 | none declared |
| `@deck.gl/maplibre` 9.4.0 | `^4.5.1 \|\| ^5.0.0 \|\| ^6.0.0` |

`@deck.gl/mapbox` declaring no peer dependency is not an oversight — it duck-types whatever map
object it is handed. That is exactly why it drifts out of compatibility silently: nothing in the
dependency graph can warn you, and the failure shows up as layers rendering in the wrong place
rather than as an error.

deck.gl's own guide is explicit: "MapLibre GL JS v4.5.1, v5, and v6 applications should use
`MapLibreOverlay` from `@deck.gl/maplibre`."

## Decision

Use `MapLibreOverlay` from `@deck.gl/maplibre`, in interleaved mode.

```ts
import { MapLibreOverlay } from '@deck.gl/maplibre'

const deck = new MapLibreOverlay({ interleaved: true })
map.addControl(deck)
deck.setProps({ layers })
```

Install deck.gl as individual packages — `@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/maplibre` —
rather than the umbrella `deck.gl`, to keep out layer families this project will never use.

Correct the `MapboxOverlay` references in `CLAUDE.md` and `GUIDE.md` rather than leaving advice in
the repository that is now wrong.

Keep `maplibre-gl` v6. The security fix stands and costs nothing.

## Consequences

**The version risk in ADR 0001 is closed**, and closed in the good direction. No downgrade, no
waiting on a release, no giving up interleaving.

**`beforeId` is a layer prop, and it is not in the published types.** deck.gl accepts a `beforeId`
on each layer naming the MapLibre layer to draw beneath, but `@deck.gl/maplibre` declares only an
internal `MapLibreLayerProps` that it never exports. Each layer is therefore constructed with a
three-line local type:

```ts
type Interleaved = { beforeId: string }
new PathLayer<Line, Interleaved>({ ..., beforeId })
```

Without that generic, TypeScript rejects `beforeId` as an excess property. If a future deck.gl
release exports the type properly, this local can go.

**The insertion point is computed, not hardcoded.** `labelLayerId` finds the last `fill-extrusion`
layer and takes the first `symbol` layer after it. Against the live liberty style — 111 layers — the
last `fill-extrusion` is `building-3d` at index 84 and the chosen layer is `waterway_line_label` at
index 88: above the buildings, below every label.

The naive reading of "below the labels" is "the first symbol layer", and it is wrong here. Liberty
has `road_one_way_arrow`, a symbol layer, at index 61 — *below* the buildings. That rule would have
buried the entire network under the 3D buildings. There is a unit test pinning exactly this case.

If no suitable layer exists, the app logs an error and draws no network, rather than letting deck.gl
silently append on top. A missing `beforeId` is a silent degradation by default, and OpenFreeMap is
a best-effort public service that can rename its layers.

**Interleaved mode requires WebGL2.** Overlaid mode does not, and would work everywhere — but it
paints deck.gl flat over the finished map image, which looks subtly wrong near tall buildings with
nothing to explain why. The app checks for WebGL2 and, where it is absent, loads the map and says
plainly that the network cannot be drawn. A visible failure beats a quiet lie; this is the honesty
rule applied to rendering rather than to data.

**The bundle roughly doubled.** Before deck.gl the production build was about 1.3 MB raw and 371 kB
gzipped. After, the main chunk is 2,117 kB raw and 595 kB gzipped, with 2,154 kB / 607 kB across all
JavaScript chunks. That is the cost of the map and the rendering engine, and Milestone 7 should know
what it is deploying before choosing a host.

**Line width is a constant 4 pixels, with no minimum or maximum.** The task list originally asked for
`widthMinPixels` and `widthMaxPixels`. With `widthUnits: 'pixels'` and a constant `getWidth`, both
clamps are unreachable — the width is already identical at every zoom. They were removed rather than
left in looking as though they did something. They would become meaningful if the unit ever changed
to metres, and that is the moment to add them back.
