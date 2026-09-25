# Design

## Context

See proposal.md for why. What shapes the approach:

- The frame loop in `MapView` owns everything that moves. It hands deck.gl the same layer instances
  every frame unless something actually changed, and it reads the stores with `getState()`, never a
  hook. React only hears about things a person changes.
- Station rings are built by `cameraLayers`, which rebuilds them only when the zoom or the hidden set
  changes. On the Ampang/Sri Petaling corridor they are pushed sideways by a gap measured in
  PIXELS, so their ground position moves with every change of zoom. `Place.lon/lat` is the mean of
  the stops on the true alignment and knows nothing of that offset.
- Everything deck.gl draws is interleaved beneath the base map's first symbol layer (`beforeId`), and
  draw order within that group is layer order. With labels it is: lines, shared lines, stations,
  trains, then labels.
- Every panel, the caption included, is a DOM element painted over the map canvas.
- `places()` exists (#23) and nothing consumes it yet.

## Goals / Non-Goals

**Goals**

- The prototype's choose/place split, ported: an occasional, cheap choice of which names show, and
  placement the renderer does for free.
- Every piece of logic worth getting right (anchors, priority, collision, search) in a pure function
  with a test. The map and the panel only feed them.

**Non-Goals**

- Labels as a pick target. Clicking a name could select its station, but a label is large and is
  drawn over the trains, so it would answer instead of the train passing beneath it, for the reason
  the track is not pickable.
- Moving the lines panel. The right-hand side and the time bar were both suggested and are
  considered below; the decision is deferred to the owner's eye.
- Filtering the map by the typed text (dimming stations that do not match). The search finds; the
  line checkboxes filter. One of each is enough until someone asks for more.

## Decisions

### Render with deck.gl's `TextLayer`, not DOM elements

The prototype places `<div>`s over the canvas. Both approaches were weighed against what this app
needs:

| | `TextLayer` in the existing overlay | DOM elements over the canvas |
|---|---|---|
| Order against the deck.gl layers | Exact: wherever it is put in the layer list, over or under the trains (now last, over them) | Over the whole canvas, always. No choice |
| Beneath the panels and caption | Yes, structurally: it is in the canvas | Yes, by stacking order, which a later `z-index` can break |
| In step with the camera | Exact: positioned in the same projection, same frame, including during `easeTo` | Projected in our loop, which is a separate `requestAnimationFrame` from MapLibre's render, so it can trail by a frame |
| Per-frame cost of placing | None of ours | Up to 40 `map.project` calls and style writes |
| Text quality | SDF glyphs, slightly softer than browser text at 12 px; halo via SDF outline | Browser text, crisp, CSS `text-shadow` halo |
| Character set | Glyph atlas built from the data (`characterSet: 'auto'`) | Anything the browser can render |
| Dependency | None new: already in `@deck.gl/layers`. Adds ~68 KB minified / ~17 KB gzipped (esbuild, deck.gl 9.4.0) | None |

This choice was first made for a reason that no longer holds. The plan was to draw names beneath
the trains, which a DOM label cannot do, and that row decided it. The owner looked at the running
app and reversed it: a name hidden by a passing train, or crossed by a line, cannot be read, so
names are now drawn over the lines and the trains. A DOM label would have done that too.

The `TextLayer` stands on the remaining rows, which are enough. It is under the panels and caption
by construction, not by a stacking order someone could later break. It moves with the camera in
MapLibre's own frame with none of our loop's projection work. It needs no new dependency. And it
can be ordered precisely against the other deck.gl layers: today last, and one line to move if the
owner's eye changes again. What keeps a train usable under a name is not draw order but picking:
the label is not pickable, so the train still answers a hover or a click. The softer text is a real
cost, and it is the thing to judge in the browser; the character set is not a cost, because every
name in the feed is ASCII and `'auto'` would cope if one stopped being.

Settings, all tuned by eye:

- `fontFamily` the app's own `system-ui, sans-serif` at weight 600 (the default is `Monaco`), 12 px,
  `sizeUnits: 'pixels'`. The selected station 14 px.
- `fontSettings.sdf: true` with an outline as the halo: dark text on a white halo in the city view,
  light text on a near-black halo in the wireframe. The mode reaches the frame loop through a ref
  kept in step by the existing mode effect, because the loop is created once on mount.
- Anchored bottom-centre, lifted by `stationRadius(zoom)` plus 10 px (`LIFT_PX`), so the name
  floats above the rings. It started at 4 px; lines crossed the names at that height, so it was
  raised.
- `parameters: { depthCompare: 'always', depthWriteEnabled: false }`. `always` because a name hidden
  inside a tower, or behind a train's body, is worse than a name in front of it: the collision pass
  would still reserve its space, so it would push out a visible name for an invisible one. No depth
  write, because the label is a flat overlay and has no business occluding anything.
- `pickable: false`, deck.gl's default, stated with a comment so nobody turns it on for symmetry.
  Being drawn over the trains makes this load-bearing: it is what lets a train under a name still
  answer a hover or a click.

Crispness, the one thing DOM text does better, cannot be measured from here. That is why the browser
task looks at the text itself, not just where it sits.

### Where a name sits: the mean of its drawn rings

`labelAnchors(places, dots, index)` takes the rings `cameraLayers` just built and returns, per place,
the mean of the drawn positions of those of its stops that have a ring. That one rule gives
everything the spec asks for:

- On the corridor, the rings already carry this zoom's pixel offset, so the name sits with them.
  With both lines shown the two rings sit symmetrically either side of the alignment, so the name
  is centred between them, which is also the true alignment (within 0.3 m on every corridor place).
  With one line hidden it moves onto the remaining ring.
- A hidden line has no rings, so its stops drop out of the mean, and the name sits with the rings
  still drawn.
- A place with no rings left gets no anchor, so it cannot be labelled. That is "labels follow
  visibility", without a second rule.

Anchors are recomputed only when `cam.dots` changes identity (zoom or hidden set), which is already
when the rings move. The label layer is rebuilt on the same trigger, not on the next choose pass,
so during a continuous zoom a corridor name never trails its rings. Rebuilding a text layer of at
most 40 items then is small beside the path re-tessellation that already happens on every zoom step.

`Place.lon/lat` is not used for drawing. It stays the true position, for the journey planner.

### Choosing: priority, a zoom gate, greedy collision, a ceiling

`chooseLabels(candidates, options)` is a pure function over candidates that are already in screen
space: `{ id, x, y, width, priority }`. The map projects the anchors with `map.project` and supplies
widths measured once per place with a canvas `measureText` in the label font, since names run from 3
to 27 characters and a per-character guess would be wrong at both ends.

1. **Priority.** 0 for the selected station's place, 1 for an interchange (served by more than one
   line) or a terminal (first or last stop of any line's direction 0), 2 for everything else. 28
   places are priority 1 today. Found from the data every time, never listed.
2. **Zoom gate.** Below zoom 12 only priorities 0 and 1 are candidates. The map opens at 12.5, so the
   first view already names some ordinary stations where there is room.
3. **Cull** anything whose anchor is off screen.
4. **Sort** by priority, then shorter name, then name, so the order is total and the same pass on
   the same view always gives the same answer. Without a total order, names flicker while panning.
5. **Greedy placement.** Walk the sorted list; each label's box (its measured width by the line
   height, plus 3 px of padding on every side) is kept only if it overlaps no box already kept.
   Priority 0 is always kept, as in the prototype: the station you chose is named even if that costs
   a neighbour its name.
6. **Stop at 40.** A ceiling, so that no zoom produces a wall of text however much room there is.

This is the prototype's algorithm with places for stations and a real zoom for its camera distance.
Measured in Node: one pass over 160 candidates with the collision test costs **0.013 ms**. The
projection of 160 anchors costs more than that and is still far under a millisecond. Throttling is
therefore not for speed alone: it is so that the set of names does not churn every frame.

### When to choose: dirty, and at most every 200 ms

A dirty flag is set by MapLibre's `move` event (every camera change, ours or the viewer's), by a
change of the hidden set, of the selection, or of the view, and by a change of anchors. The frame
loop runs a choose pass only when the flag is set and 200 ms have passed since the last one, then
clears it. The last `move` of a gesture leaves the flag set, so a final pass always runs once the
camera settles. A still camera never re-chooses.

The label layer instance is replaced only when the chosen ids, the anchors or the mode changed, and
otherwise handed back unchanged, as the station layer is. It goes last in the layer list, after
the trains.

### The search lives in the lines panel

A search box at the top of the existing panel, inside the same `<details>`, so the panel is still
one control that opens and closes as a whole, and still starts closed at phone width. The typed text
is React state: a person changes it, and nothing in the frame loop reads it.

`src/ui/search.ts`, pure and tested:

- `normaliseName(s)`: Unicode-decompose, drop combining marks, lower-case, drop spaces, hyphens and
  apostrophes. So "sunway setia" finds "Sunway-Setia Jaya", and a future accented name is found
  without its accent.
- `findPlaces(places, query, limit = 8)`: names starting with the query first, then names
  containing it, each group in name order. An empty query finds nothing, so the panel shows its line
  rows as it does today.
- `firstShownStop(place, lines, hidden)`: the first of the place's stops on a shown line, or none.

Each result is a `<button>` (the keyboard route, as the per-line stop buttons already are) showing
the name and the line pills. Pressing one calls the existing `goToStation` with that stop, which
selects it, opens its card and flies the camera there with the existing reduced-motion handling. For
a spread-out interchange such as Ampang Park the camera centres on that one ring, a couple of
hundred metres from the label, which is on screen at the arrival zoom and not worth a second code
path. A result with no shown stop is disabled, as a hidden line's stop buttons already are.

The highlight is derived, not stored: the place containing the selected station's stop gets
priority 0 and the larger size. That also highlights a station selected by clicking its ring, which
is the same fact and should look the same.

`places()` is computed once, in one module both the map and the panel import, alongside the
prepared network the map already builds, so the panel does not prepare the network a second time.

### The caption and the panels

Nothing to build. Every panel is DOM over the canvas, so a canvas-drawn name can be covered by the
caption and can never cover it. A name may be half under a panel; that is the panel winning, which is
the right way round. Excluding names that fall under panels would mean measuring panels in the
choose pass, and is left until the eye says it matters.

### Panel placement

Kept where it is, bottom-left above the time bar. A right-hand panel and a slot inside the time bar
were both suggested in #25. The right-hand side competes with the card on a wide screen, and the time
bar is already the most crowded row at phone width. Both are recorded as considered and deferred to
the owner, who can judge it now that there is something concrete to look at.

### OpenStreetMap's station names come off the base map; bus stops stay

The owner's call: ours are the only station names. The mechanism comes from the tiles, not the layer
names. A station there is a POI of class `railway`, printed by liberty's `poi_r1`, `poi_r7` and
`poi_r20` from zoom 15. `poi_transit`, which sounds like the right layer, admits `airport`, `bus` and
`rail` and never `railway`, so in KL it is bus stops.

So every POI symbol layer gets `["!=", ["get", "class"], "railway"]` combined with its own filter by
`["all", ...]`, with `setFilter`, once, at load, from the same snapshot the modes use and before the
overlay is added. Keyed on `source-layer: poi`, never on id, as the mode rules are. It reaches
`poi_transit` too and changes nothing it draws. The modes write visibility and paint and never a
filter, so no switch of mode can bring the names back; the wireframe hides every symbol anyway.

Bus stops stay visible: they are real stops, some named after the station they serve, and #40 puts
live buses on this map. Hiding them is not what was asked.

## Risks / Trade-offs

- [SDF text is softer than browser text at 12 px] → Judged by eye in the browser task. Size, weight
  and outline are the levers, and `fontSettings.fontSize`/`buffer` raise atlas quality if needed.
- [In the city view, MapLibre's own symbol layers (street and POI names) are drawn above the whole
  interleaved group, so they can print over a station name] → They are drawn with their own
  collision and are sparse at these zooms; the wireframe hides them entirely. Look for it in the
  browser task.
- [`depthCompare: 'always'` means a name shows through a building in front of its station] → That is
  what map labels do, and the alternative hides names while keeping their space. Chosen deliberately.
- [The 200 ms choice means a name can pop in up to a fifth of a second after it gains room] → The
  prototype's figure, and the thing that stops names churning. Tunable.
- [Measured widths assume the label font is loaded when measured] → `system-ui` is a system font
  and needs no loading. If a web font is ever used, measure after `document.fonts.ready`.
- [Priority 0 overrides collision, so a selected station can overlap one other name] → Only one
  place can be selected, so at most one overlap, and it is the one the viewer asked for.

## Migration Plan

None. Additive, behind nothing. Rollback is reverting the pull request.

## Open Questions

- Density figures (zoom 12 gate, 40 ceiling, 3 px padding, sizes, halo) are starting values, to be
  tuned by eye.
