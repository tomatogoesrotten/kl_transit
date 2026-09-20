# Design

## Context

Ampang and Sri Petaling share their last 8,488 m of track and are drawn on identical geometry, so
they z-fight into stripes. Zoomed out, the two colours are indistinguishable.

Everything about the corridor below was measured from `data/network.json`, not assumed.

## Goals / Non-Goals

**Goals**

- Two lines on one alignment, visibly parallel, legible at every zoom.
- Stations and trains staying on their own line's drawn path.
- Corridors found in the data, so a feed change is handled rather than breaking quietly.

**Non-Goals**

- Merging interchange markers. Different problem, still after-version-1.
- A track-diagram solver. One corridor exists; handle more if they appear, but this is not a layout
  engine.
- Any change to `src/sim`. The simulation reports true positions; offsetting is drawing.

## What is actually in the data

- **One pair only.** Ampang (`AG`) and Sri Petaling (`PH`) share 89 **exactly equal** vertices. No
  other pair shares a single vertex, so detection can rely on coordinate equality rather than
  needing a tolerance.
- **Ampang** 6,405 m → 14,893 m (vertices 22–120 of 120). **Sri Petaling** 28,762 m → 37,250 m
  (vertices 216–314 of 314). Both 8,488 m.
- Both run the corridor in the **same direction** — first and last shared vertices are identical
  for each — and both **terminate** at its far end.

So: one corridor, one open end at Chan Sow Lin, one terminal end at Sentul Timur.

## Decisions

### The separation is in pixels, not metres

The decision this change turns on, and the one the owner's second screenshot settled.

A perpendicular offset measured on the ground scales with the camera. At city-wide zoom a
track-realistic offset is sub-pixel and the lines merge back into the stripe this change exists to
remove. Conversely, an offset large enough to read when zoomed out would, at street level, put two
services a block apart.

So the offset is a **constant number of pixels**, converted to metres for the camera in hand:

```ts
const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom
const offsetMetres = offsetPixels * mpp
```

That is the same relation `src/map/trains.ts` already uses to size trains, so it is reused rather
than reinvented.

**Consequence: the offset geometry depends on the camera and must be rebuilt when the zoom
changes.** Not every frame — zoom changes are rare, and only the lines that actually share track
need rebuilding. Splitting those into their own `PathLayer` keeps the other six from
re-tessellating, which a `PathLayer` does whenever its `data` reference changes.

### Detect corridors, don't hardcode them

A shared corridor is found by indexing every line's path vertices by coordinate and looking for
vertices used by more than one line. Exact equality is enough: the feed either shares a vertex or it
does not, and the 89 shared vertices are byte-identical.

Hardcoding `AG` and `PH` would work today and fail silently the day the feed interlines a different
pair — the same class of failure this project has already hit twice, where something keeps running
while quietly doing the wrong thing.

For each corridor, participating lines are ordered deterministically (by line id) and given slots
spread symmetrically about the true alignment: for two lines, one half a gap to each side. The
ordering must be stable, or the two lines would swap sides between reloads.

### The offset is a function of distance along the line

This is what keeps the parts together.

Station markers and trains are both placed by `pointAt`, which returns a position for a distance
along the line. If only the drawn path moved, markers would float beside their own track and trains
would run next to it.

So the offset is expressed as `offsetAt(lineId, atMetres) → metres`, and applied identically to:

- the path geometry, vertex by vertex
- the station markers, at each stop's `at`
- the trains, where it **adds to** the existing keep-left shift rather than replacing it

Both are perpendicular offsets in the same frame, so they compose by addition. A train on an offset
stretch therefore sits on its own line's drawn track and still keeps left of its direction of
travel.

### Taper at the open end

At the terminal end both lines simply stop, and two parallel stubs at a two-platform terminal are
honest enough.

At the open end the offset must return to zero over a distance, or the line steps sideways by the
full gap in one segment. A linear ramp over a few hundred metres of the corridor is enough; the eye
reads it as the two tracks converging into a junction, which is what is physically there.

### A small height difference, once and for all

Every line gets a small distinct elevation, ordered by its index. Coincident geometry then has a
defined front-to-back order instead of contending for the depth buffer.

This costs nothing, and it means a future feed that overlaps two lines in some way this change did
not anticipate degrades to "one is in front" rather than to stripes.

## Risks / Trade-offs

**Rebuilding path geometry on zoom change.** Only the corridor's vertices actually move, but a
`PathLayer` re-tessellates its whole `data`. Mitigated by splitting shared-track lines into their
own layer. If that ever shows, the next step is quantising the rebuild to whole zoom levels.

**The gap in pixels is taste.** It wants looking at, which is why the spec fixes only that the
separation stays legible at every zoom and not a number.

**Exact-equality detection would miss a near-miss corridor.** If a future feed had two lines running
on almost-but-not-quite the same coordinates, they would not be detected and would draw as they do
today. Accepted: a tolerance needs a distance threshold, which is a new way to be wrong, and no such
case exists. The failure mode is the current behaviour, not something worse.

**Trains carry two offsets now.** Keep-left and corridor offset compose by addition, which is
correct but means a sign error in either shows up as a train beside its track. Both are testable
independently and both have tests.

## Migration Plan

None. Additive, and lines that share no track are drawn exactly as before.

## Open Questions

None.
