# Proposal

## Why

The map shows the rail network over a full street map of Kuala Lumpur. That answers "where is this
in the city", which is the right first question. It does not answer "what shape is this network",
because the city is busy — roads, water, parks, place names and POI icons all compete with eight
coloured lines for the same pixels.

Once trains are moving (Milestone 4), the second question matters more than the first. Watching
service build up across the whole system at 06:30, or thin out at 23:00, is much easier when the
city is not there.

Requested by the owner: two modes, switchable on the map.

## What Changes

- A second mode, **wireframe**: the city reduced to a blueprint. Dark ground, streets as thin dim
  lines, water dimmer still, buildings as translucent volumes with their footprints picked out in
  light. Land-use fills, POI icons and place names gone. The network unchanged and brightest.
- The existing view becomes the **city** mode, unchanged.
- A switch on the map toggles between them.
- The chosen mode survives a reload.
- Switching keeps the camera exactly where it is: position, zoom, pitch and bearing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `network-map`: gains the requirement that the viewer can switch the city to a schematic view. The
  existing requirement that the network is drawn *among* the city needs no change: the schematic
  view still has buildings, so the network still composes with them.

## Impact

- **Modified**: `src/map/MapView.tsx` (applying the mode), and the style-layer visibility logic,
  which is new.
- **New**: a switch component. `CLAUDE.md` puts React components under `src/ui/`, which does not
  exist yet; this change creates it.
- **No change** to `src/sim/`, the deck.gl layers, or the data.
- **Dependencies**: none added.
- **Downstream**: Milestone 5 builds the clock and time controls as React components and will sit
  the mode switch alongside them. Whatever this change builds should be easy to move into that
  panel rather than being welded to the map's corner.

## Non-goals

- No third mode. A first attempt hid the basemap entirely, leaving the network on an empty ground.
  The owner looked at it and did not like it — the network alone loses all sense of place — so it is
  replaced rather than kept alongside.
- Not true wireframe buildings. MapLibre's `fill-extrusion` has no outline property, so edges cannot
  be stroked. Translucent volumes plus a lit footprint layer is the approximation; reading building
  tiles into deck.gl would be the upgrade, and is a new dependency for a visual effect.
- Not a general basemap switcher. One style, two visibilities.
- No per-line toggles. That is Milestone 6's lines panel.
