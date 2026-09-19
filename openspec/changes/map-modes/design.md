# Design

## Context

The map shows the network over OpenFreeMap's liberty style. The owner wants a second view where the
city recedes and the network dominates, and a switch on the map to change between them.

A first attempt hid the basemap entirely, leaving the network on an empty ground. The owner looked at
it and did not like it — the network alone loses all sense of place. Replaced, unmerged, by the
schematic view described here: the city still there, but reduced to a blueprint.

## Goals / Non-Goals

**Goals**

- A schematic view where the city's structure survives — streets, water, where buildings stand — but
  its colour and clutter do not.
- The rail network the brightest thing on screen, drawn identically in both views.
- Camera preserved across a switch, and the deck.gl overlay untouched by one.
- No new dependency.

**Non-Goals**

- True wireframe buildings. See the constraint below.
- A general basemap switcher, or a second tile provider.
- Per-line toggles. Milestone 6.

## The constraint that shapes this

**MapLibre's `fill-extrusion` has no outline or wireframe property.** Extruded buildings can be
coloured and made translucent; their edges cannot be stroked. There is no paint property for it.

So "glowing 3D outlines" is not achievable with MapLibre alone. What is achievable, and is what this
builds:

- the extrusion itself, in a dark blue at low opacity — buildings read as translucent volumes
- **plus a line layer added on the same `building` source-layer**, drawing each footprint in a
  brighter blue — the bases are lit, the volumes are ghosts above them

True wireframe extrusions would mean reading the building vector tiles into deck.gl (`MVTLayer` from
`@deck.gl/geo-layers`, whose `PolygonLayer` does support `wireframe: true` on extruded polygons).
That is a new dependency and a second tile pipeline for a visual effect. Not now. If the
approximation is not enough after looking at it, that is the upgrade path.

## Decisions

### Recolour layers, don't swap the style

`map.setStyle()` tears down and rebuilds the whole style, destroying the layer the deck.gl overlay
targets with `beforeId` and forcing the overlay's layers to be rebuilt. Instead, `setPaintProperty`
and `setLayoutProperty` are applied per layer. The layer objects stay, the overlay never learns the
mode changed, and the camera is preserved for free because nothing touches it.

### The snapshot must be taken before the overlay is added

This was missed in the first version of this design and caught during implementation. It is the
single easiest thing here to get wrong, so it is stated plainly:

deck.gl's interleaved overlay **inserts its own layers into the style**. Iterating the live
`map.getStyle().layers` at switch time would therefore return `lines` and `stations` alongside
liberty's own, and the schematic view would restyle or hide the very network it exists to show.

`MapView` captures `map.getStyle().layers` inside the `load` handler, *before* `map.addControl(deck)`,
and every mode change iterates that snapshot.

The snapshot is also what restores city mode: each layer's original `paint` and `layout` are right
there in it, so nothing needs a separate "original values" store and nothing is hardcoded.

### What the schematic view does to each layer

Rules by layer type and source-layer, applied to liberty's 111 layers:

| Layers | In the schematic view |
|---|---|
| `background` | dark ground |
| `line` on `transportation` (58 of them) | thin, dim blue — the street grid survives as structure |
| `fill` on `water`, `line` on `waterway` | dim blue, darker than the streets |
| `fill-extrusion` on `building` | dark blue, low opacity — translucent volumes |
| `fill` on `building` | hidden; the added outline layer replaces it |
| `fill` on `landcover`, `landuse`, `park`, `aeroway`, `transportation` | hidden — colour that competes |
| `line` on `park`, `boundary`, `aeroway` | hidden |
| every `symbol` layer | hidden — place names and POI icons |
| the `raster` hillshade | hidden |

Rules are keyed on type and source-layer rather than on layer id, so a liberty update that renames or
adds a layer is handled by its category instead of falling through unstyled.

### One layer we add

A `line` layer on `source-layer: building`, inserted at the same `beforeId` the network uses, drawing
footprints in a brighter blue. Added once at load and toggled by visibility, not added and removed on
each switch.

This is the only layer the app contributes to the basemap, and it exists solely because
`fill-extrusion` cannot be stroked.

### React state, not a ref

`CLAUDE.md` says React state is for "things a person changes". This is exactly that, it changes on a
click rather than sixty times a second, so the rule about keeping React out of the frame loop does
not apply.

### `src/ui/` starts here

The switch takes its state and a callback as props and knows nothing about MapLibre, so Milestone 5
can lift it into the controls panel unchanged.

### Remembering the choice

`localStorage`, read once on mount, defaulting to the city view — a newcomer's first question is
"where is this". Read and write are both wrapped, because the spec requires that a browser refusing
to store it still leaves the app working.

## Risks / Trade-offs

**The colour palette is taste, and taste needs eyes.** The values here are a starting point, not a
contract. The spec states the *intent* — dark ground, dim streets, lit footprints, network brightest
— and deliberately fixes no hex values, so they can be tuned without touching the spec.

**A liberty update could add a layer category the rules don't cover.** Unmatched layers are left
alone rather than hidden, so the failure mode is a stray coloured layer rather than a missing one —
visible, and easy to diagnose.

**The schematic view still downloads every tile**, including for layers it hides. Accepted: the
alternative costs an overlay rebuild, and tiles are cached.

**`setPaintProperty` across ~110 layers per switch.** It happens on a click, and MapLibre does not
reload sources for it. Not worth batching.

## Migration Plan

None. Additive, and the city view is unchanged.

## Open Questions

None.
