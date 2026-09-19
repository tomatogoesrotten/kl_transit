# Design

## Context

The map shows the network over OpenFreeMap's liberty style. The owner wants a second view with no
basemap at all — the network as a diagram floating in space — and a switch on the map to change
between them.

## Goals / Non-Goals

**Goals**

- Two views, one switch, camera preserved across the change.
- Skeleton mode genuinely empty: no roads, water, land use, buildings, labels or POI icons.
- Nothing in the deck.gl overlay needs to know which mode is active.

**Non-Goals**

- A third mode. A wireframe look is a separate change.
- A general basemap switcher, or a second tile provider.
- Per-line toggles. Milestone 6.

## Decisions

### Hide layers, don't swap the style

The obvious approach is `map.setStyle()` with a minimal style. It is the wrong one here:
`setStyle` tears down and rebuilds the whole style, which destroys the layer the deck.gl overlay
targets with `beforeId` and forces the overlay's layers to be rebuilt. It also refetches sources.

Instead, set `layout.visibility` to `none` on every style layer except `background`. The layer
objects stay in the style, so `beforeId` still resolves and the overlay is untouched — it does not
even need to know the mode changed.

```ts
for (const layer of map.getStyle().layers) {
  if (layer.id === background) continue
  map.setLayoutProperty(layer.id, 'visibility', skeleton ? 'none' : 'visible')
}
```

This also gets "switching does not move the camera" for free, because nothing about the camera is
touched.

**Trade-off:** hidden layers still have their sources loaded, so skeleton mode keeps fetching tiles
it does not draw. Wasteful, and not worth fixing: the alternative costs the overlay a rebuild and
the tiles are cached anyway. If it ever matters, `map.setLayoutProperty` on the *source* or removing
the source is the upgrade, and skeleton mode would then pay a reload on the way back.

### The ground is the background layer's colour

Liberty's `background` layer is the only one left visible in skeleton mode, so its paint colour is
the skeleton's ground. Setting it dark makes the line colours carry, which is the point of the mode.

Restoring city mode means putting the original colour back, so the original is read from the style
once at load rather than hardcoded — a style update could change it, and hardcoding would leave a
mismatched patch behind.

### React state, not a ref

`CLAUDE.md` says React state is for "things a person changes: selection, speed, visible lines". This
is exactly that. The mode lives in React state, and an effect applies it to the map.

This is not the frame loop. It changes when a person clicks, not sixty times a second, so the rule
about keeping React out of the loop does not apply and a re-render per click costs nothing.

### `src/ui/` starts here

`CLAUDE.md`'s architecture block has always listed `src/ui/` for React components; nothing has
needed it until now. The switch is the first occupant.

It takes its state and a callback as props and knows nothing about MapLibre, so Milestone 5 can lift
it into the controls panel without rewriting it.

### Remembering the choice

`localStorage`, read once on mount. The spec requires that a browser refusing to store it — a
private window, or storage disabled — leaves the app working, so the read and the write are both
wrapped and a failure falls back to city mode.

Default is city. Someone arriving for the first time wants "where is this", and the diagram only
makes sense once you know what you are looking at.

## Risks / Trade-offs

**A style update could add a layer type that hiding does not cover.** The rule is "everything except
background", so a new layer is hidden by default rather than leaking through. Fine.

**`setLayoutProperty` across ~110 layers on every switch.** MapLibre handles this without a
re-render of sources, and it happens on a click. Not worth batching.

**Skeleton mode on a slow connection still downloads tiles.** Noted above, deliberately accepted.

## Migration Plan

None. Additive, and city mode is unchanged.

## Open Questions

None.
