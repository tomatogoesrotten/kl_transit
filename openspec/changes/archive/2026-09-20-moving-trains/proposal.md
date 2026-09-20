# Proposal

## Why

The simulation knows where every train is at any moment. The map knows how to draw things. Nothing
has connected them, so the network sits on screen as a static diagram of a system that in reality is
never still.

This is the milestone the project exists for: trains moving on the timetable, on a real map of Kuala
Lumpur. Everything before it was groundwork, and everything after it — the clock, the cards, the
line panel — is about steering what this change puts on screen.

## What Changes

- An animation loop in `src/map/` that each frame advances a simulated clock, asks the simulation
  which trains are running, and redraws them. React is not involved; the loop writes to the deck.gl
  overlay directly.
- Each train drawn as a small box oriented along its direction of travel, with a neutral body and a
  roof in its line's colour.
- **Trains keep left**, shifted to the left of their direction of travel, because Malaysia drives on
  the left and the two directions would otherwise sit on top of each other.
- Trains sized in real metres when the camera is close, with a floor of about 20 pixels so they stay
  visible when the whole network is in view.
- A station's marker fills with its line's colour while a train is stopped at it.
- Trains drawn at roughly viaduct height, so they read as part of the city's three dimensions rather
  than painted on the ground.

## Capabilities

### New Capabilities

- `train-rendering`: showing the trains the simulation computes — where they are, which way they
  face, which side of the track they run on, how large they appear, and what a station does while a
  train is standing at it.

### Modified Capabilities

None. `train-simulation` and `network-map` are both consumed unchanged.

## Impact

- **New code**: the train layers and the animation loop, under `src/map/`.
- **Modified**: `src/map/MapView.tsx` gains the loop and a mutable clock record; `src/map/layers.ts`
  changes how station markers are filled, because deck.gl's `filled` is a layer-wide property and
  cannot be set per marker.
- **No change** to `src/sim/`. This change consumes it. The clock record that drives the loop lives
  in `src/map`, because `src/sim` may not hold mutable state or read the clock — a rule its own test
  suite enforces.
- **Dependencies**: none added. A true oriented 3D mesh would want `@deck.gl/mesh-layers`, which is
  not installed; two extruded polygon layers give the same shape from packages already present.
- **Downstream**: Milestone 5 replaces the loop's hard-coded clock with real controls, and Milestone
  6 adds picking to these layers. Both build on the loop this change creates.

## A limitation we cannot fix, and will not hide

The feed carries no elevated-or-underground information. Every line is a flat path with no height.

Trains are drawn at roughly viaduct height because most of this network is elevated, and because
trains at ground level would be hidden behind buildings exactly where the network is busiest. That
is right for the elevated majority and wrong in two places: trains will still be occluded by tall
buildings in the city centre, and they will float above the ground where the line is in fact in a
tunnel.

Both are consequences of the data, not of the drawing. The honesty rule says to show that rather
than to invent heights the feed does not contain, so the limitation is stated in the app's own
explanation of its data rather than quietly smoothed over.

## Non-goals

- No clock, no time controls, no speed multiplier interface. Milestone 5. The loop needs a clock to
  run; it does not need a person to be able to change it yet.
- No hovering, clicking, tooltips, cards or follow-camera. Milestone 6.
- No per-line visibility. Milestone 6, and deliberately not by adding a `visible` flag to the
  prepared network, which must stay pure data.
- No real train models. That is on the polish list, and would be the moment to reconsider
  `@deck.gl/mesh-layers`.
