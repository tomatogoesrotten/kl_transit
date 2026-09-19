# Proposal

## Why

The working prototype (`reference/prototype.html`) already computes where every train is at any
moment from the GTFS timetable, and it is correct — `reference/sim-golden.json` records its exact
output for the shipped feed. But it is untyped JavaScript wedged into a single HTML file, it reads
the wall clock and the DOM from inside the maths, and it draws in Three.js on a flat grid.

The real app draws on a MapLibre map in longitude and latitude. The drawing has to be rewritten;
the simulation must not be. Porting it now, with no pixels changing, means the riskiest part of the
project is proved correct before anything is built on top of it. Every later milestone assumes this
layer already works.

## What Changes

- New `src/sim/` module: pure TypeScript, timetable in, train positions out. No DOM, no
  `Date.now()`, no module-level mutable state. Time is always an argument.
- Ported functions: `prepare`, `progress`, `pointAt`, `activeTrains`, `nextDepartures`,
  `firstDeparture`, and the Kuala Lumpur clock helpers `klNow`, `svcOf`, `setTimeOfDay`.
- Full TypeScript types for the `network.json` shape, so a malformed data file fails
  `npm run build` rather than a user's browser.
- **BREAKING** (relative to the prototype, which ships nothing): `pointAt` returns
  `{ lon, lat, bearingDeg }` instead of local `x`/`z`. The map works in longitude and latitude, so
  the conversion belongs in the simulation rather than being repeated at every call site. Distances
  stay in metres.
- **BREAKING** (relative to the prototype): `bearingDeg` is a compass bearing — 0 = north, 90 =
  east, clockwise. The prototype's only heading maths is a Three.js Y-rotation measured from south,
  180° away. The prototype's convention is not carried over.
- `prepare` becomes non-mutating. The prototype monkey-patches derived fields onto the network
  object it is given; the port returns a new `PreparedNetwork`.
- `klNow` and `setTimeOfDay` take an epoch in milliseconds and return a value. The prototype's
  mutable `clock` object and its `syncButtons()` DOM call do not move into `src/sim` — they belong
  to React, in a later milestone.
- New Vitest suite reproducing every case in `reference/sim-golden.json`.

## Capabilities

### New Capabilities

- `train-simulation`: given the timetable in `network.json` and a moment in Kuala Lumpur time,
  compute which trains are running, where each one is on its line in longitude and latitude, which
  way it is pointing, what it is doing (running or stopped at a platform), and when the next
  departures from a given platform are.

### Modified Capabilities

None. This is the project's first spec.

## Impact

- **New code**: `src/sim/` (types, the simulation, the clock helpers) and its tests.
- **No change** to `src/map/`, `src/App.tsx` or anything drawn on screen. Nothing visible moves in
  this change; that is deliberate and is the point of the milestone.
- **Data**: reads `data/network.json` and `reference/sim-golden.json`. Neither is modified.
  `reference/` stays read-only — code is ported from it, never imported.
- **Dependencies**: none added.
- **Downstream**: Milestone 3 draws the network using `pointAt`, and Milestone 4's animation loop
  calls `activeTrains` every frame. Both depend on the signatures fixed here, so the shapes chosen
  in this change are hard to alter later.
- **Risk**: the golden file is pinned to the shipped feed snapshot. When the daily refresh in
  Milestone 7 changes the timetable, these exact numbers stop matching, and that is correct
  behaviour, not a regression. The golden tests must therefore run against a saved copy of
  `network.json`, and refresh-time checks must be written as general rules instead.
