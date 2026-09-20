# Design

## Context

The prototype hit-tests in screen space against positions it cached while drawing. The port uses
deck.gl picking, which is a different mechanism with different properties. Most of this design is
the difference between the two, and the four places where a literal port misbehaves.

## Goals / Non-Goals

**Goals**

- Hover, cards, follow and the lines panel, working by pointer, touch and keyboard.
- No re-render at the rate the map animates.
- A selection that does not lie about what happened to it.

**Non-Goals**

- Merging interchanges, labels, station models, journey planning. Issues #23–#26.
- Fixing the known next-departures quirk. Documented, deliberate, its own change.

## Decisions

### Picking, and the two settings that are not on layers

`pickable: true` plus `onHover` / `onClick` per layer is the whole mechanism. Two things are
properties of the renderer rather than of a layer, and both matter:

- **The cursor.** In interleaved mode deck.gl draws onto MapLibre's own canvas, and its default
  cursor function writes `grab` there every frame. MapLibre's own pointer and grabbing states never
  appear. Setting the cursor explicitly is not polish; without it the map feels broken and nobody
  would guess why.
- **The picking radius**, which defaults to zero — an exact pixel hit. The prototype allowed 20 px
  for trains and 14 px for stations, which is what makes a small distant train catchable at all.

**The track layers must not be pickable.** They are large and they are everywhere near a line; if
they answer, they answer instead of the train standing on them.

**Trains beat stations** because trains are drawn at viaduct height and station markers at a
fraction of a metre. That is depth order doing the work, and it is worth knowing it is load-bearing:
flatten those elevations and picks start flickering between a dwelling train and its platform.

**Picking sees a different scene from the picture.** deck.gl picks into its own buffer with its own
depth, so a building hides a train visually but never blocks the pick. The prototype had the same
property. Leave it; do not build occlusion testing to "fix" a thing nobody has complained about.

### A picked train has to know which train it is

The instances handed to the renderer carry a position, an orientation and a colour. Picking one
currently reports nothing identifying. It needs an identity — and only that, not the whole train
record, which holds references the renderer would then keep alive for the frame.

### The drawn position is not the simulated position

A train is shifted left of its direction of travel, and on the shared corridor shifted again. Both
amounts depend on the camera.

So anything this change draws for a selected train, and the follow camera, must go through the same
path with the same frame's values. Recomputing from the simulation puts it metres away and drifting
as the zoom changes. `MapView` already carries a comment warning about exactly this.

### Following: move the camera every frame, and tell your own moves from theirs

The tracking move is a jump, not an animation. An animated move started every frame is cancelled by
the next one, never completes, and emits a start-and-end pair each time. Smoothing is ours to do —
the prototype closes a fraction of the gap per frame, which is one line.

Telling the viewer's move from ours is the whole difficulty, because we move the camera constantly.
The map's own events carry the originating interaction only when a person caused it, which is the
distinction to use. Drag is the signal; zoom deliberately is not, because changing how close you are
is not taking the map back.

### Per-line visibility: filter the data, never the corridors

The shared-track corridors are computed once from the whole network. Recomputing them from the
visible subset would snap 8.5 km of line sideways the instant its partner was hidden — for a
checkbox.

So hiding a line filters the layers' data and this frame's trains, and leaves the corridor map
alone. A consequence, correct and worth being ready to explain: hiding one of a pair leaves the
other drawn beside an alignment it now has to itself. The offset is a drawing convention, not a
claim about rails.

The line and station layers are built once and rebuilt only when their inputs change. The hidden set
is a new input and needs the same treatment.

### Where the state lives

Visibility, selection and the followed train are all things a person changes, so they go in the
store beside the clock.

Running counts are not: they are derived from the frame's trains and belong nowhere but the DOM,
written through refs a few times a second. The machinery for that already exists for the clock
readout. A `setState` four times a second is still a React render driven by the frame loop.

**Hover is the sharpest case.** It fires on every pointer movement. Writing the description through
a ref costs nothing; a `setState` per hover event re-renders the tree mid-drag.

### The selection must not lie

A train's identity is composed from its line, direction, day type and which departure of the day it
is. Three things change it under the same physical train: midnight rolls a departure from today's
list into yesterday's; forcing a different timetable renames every train on screen; and scrubbing
away and back makes it absent and then present again.

The prototype shows "Trip finished" whenever it cannot find the selection. For a train that is still
visibly running that is simply false, and the honesty rule forbids it.

The fix is to hold enough alongside the selection to recognise the same train under a different
identity, and to distinguish "this trip has ended" from "I can no longer find this" — and say the
second one honestly rather than dressing it as the first.

### Layout

The lines panel goes bottom-left, above the time bar — the space reserved for it. The card goes
right, below the mode switch.

The time bar's height is not fixed: it wraps, and it grows when the no-trains notice appears. So the
panel must not be positioned by a hardcoded offset from the bottom. One absolutely positioned
bottom-left column containing both, laid out by the browser, replaces the prototype's measuring code
entirely — no resize listener, nothing to re-run when a panel opens.

At phone width both become one column, with the lines panel collapsed by default, as the prototype
does.

Native elements throughout, for the reason the existing components already give: `<details>` for the
panel, real checkboxes for the toggles, real buttons for close and follow.

### Keyboard

The prototype has no keyboard path to any train or station — its canvas advertises arrow-key panning
that nothing implements. MapLibre ships a real keyboard handler, so keeping the canvas focusable
makes that label true for free.

For selecting *things*, the honest native route is the panel that has to exist anyway: a line's row
expands to its stations, and a station is a button. That is screen-reader navigable, needs no roving
focus over a canvas, and reuses what is already being built.

## Risks / Trade-offs

**Times that count down versus times that are fixed.** A card showing "3 min" changes every few
seconds; one showing a clock time does not. Fixed times re-render less and read better at a glance.
Showing both costs nothing.

**Post-midnight times read as though they were in the past.** A stop at 00:14 shows as `00:14` with
no day marker. Prototype behaviour; acceptable, but it should not silently look like a time already
gone.

**Hover on touch.** A tap would otherwise flash a description before opening the card. Hover is for
pointers that hover.

## Migration Plan

None. Additive.

## Open Questions

None.
