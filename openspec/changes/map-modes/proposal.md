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

- A second mode, **skeleton**: every basemap layer hidden — roads, water, buildings, labels, POI
  icons — leaving the eight lines, their 187 stations, and a flat ground.
- The existing view becomes the **city** mode, unchanged.
- A switch on the map toggles between them.
- The chosen mode survives a reload.
- Switching keeps the camera exactly where it is: position, zoom, pitch and bearing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `network-map`: gains the requirement that the network can be shown without the basemap, and that
  the choice is the viewer's. The existing requirement that the network is drawn *among* the city
  needs restating, because it is no longer unconditionally true — in skeleton mode there is no city
  to be drawn among.

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

- No third mode. A wireframe or blueprint look — dark ground with glowing building outlines — was
  considered and set aside. It is a bigger piece of work and can be its own change.
- Not a general basemap switcher. One style, two visibilities.
- No per-line toggles. That is Milestone 6's lines panel.
