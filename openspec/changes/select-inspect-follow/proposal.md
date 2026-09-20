# Proposal

## Why

The map shows the network moving and lets you choose when. It cannot answer a question about
anything on it. Which line is that train? Where is it going? When is the next one from this station?
Which of these eight colours is which?

This is the last build milestone: the one that turns a moving picture into something you can
interrogate.

## What Changes

- Hovering a train or a station says what it is.
- Clicking a train opens a card: its line, where it is going, where it started and when, what it is
  doing right now, and its next five stops with clock times.
- Clicking a station opens a card with the next departures in each direction.
- A Follow button keeps the map on a train, and lets go the moment the map is dragged.
- A lines panel: one row per line with its colour, its name, how many of its trains are running, and
  a switch that hides the line, its stations and its trains.

## Capabilities

### New Capabilities

- `inspection`: asking the map about what is on it — what a thing is, what it is doing, what is
  coming next, and which parts of the network to show at all.

## Impact

- **New code**: the cards, the lines panel, and selection state in the store.
- **Modified**: the deck.gl layers gain picking; `TrainInstance` gains an identity, because a picked
  train currently reports nothing about which train it is; the frame loop resolves the selection and
  drives the follow camera.
- **No change** to `src/sim/`. Per-line visibility and running counts are view concerns and must not
  be hung on the prepared network — its purity suite fails the build on exactly that.
- **Dependencies**: none added.

## What the traversal found that changes the plan

**Two picking settings are properties of the renderer, not of a layer.** Without setting the cursor
explicitly, deck.gl writes `grab` onto MapLibre's own canvas every frame in interleaved mode, so
MapLibre's own pointer and grabbing states never appear. That is a bug this change would have
shipped unnoticed.

**The track layers must be excluded from picking**, or they answer every hover near a line and the
"trains first, then stations, then nothing" behaviour is lost.

**A train's drawn position is not where the simulation says it is.** It carries the keep-left shift
and, on the shared corridor, the offset — both of which change with zoom. Anything drawn for a
selected train, and the follow camera, must go through the same path with the same frame's values,
or it sits a few metres away and drifts as you zoom.

**A picked train currently has no identity.** The instances handed to the renderer carry a position,
an orientation and a colour, and nothing else. Giving them an identity is the one change this
milestone requires in the train layer.

**Per-line visibility must not touch the shared-track corridors.** Those are computed once from the
whole network. Recomputing them from the visible subset would snap 8.5 km of line sideways the
moment its partner was hidden.

## An honesty problem worth stating

A train's identity is derived from its line, direction, day type and which departure of that day it
is. It is stable while those hold — but at midnight a departure that was today's becomes
yesterday's, and forcing a different timetable renames every train on screen.

So a selection can die while the train it names is still visibly running, and the card would say the
trip had finished when it plainly has not. That is a lie the display must not tell, and this change
has to decide what it says instead.

## Non-goals

- Merging interchange markers, station labels, station models, journey planning. Issues #23 to #26.
- Fixing the known quirk in the next-departures calculation. It is documented, deliberate, and its
  fix is its own change with its own regenerated golden file.
