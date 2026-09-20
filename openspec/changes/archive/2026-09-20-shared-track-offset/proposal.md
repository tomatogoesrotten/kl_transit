# Proposal

## Why

Where the Ampang and Sri Petaling lines share track, both are drawn on identical geometry at the
same elevation. They z-fight into an orange-and-maroon barber's pole. It reads as a rendering fault
rather than as two services, and zoomed out the two colours are indistinguishable.

`GUIDE.md` lists offsetting shared track as after-version-1 work. Promoted, because the current
output misrepresents the network rather than merely simplifying it.

## What Changes

- Each line that shares track with another is drawn offset perpendicular to its direction of travel
  within the shared stretch, so the two run visibly parallel.
- The offset is **a constant size on screen at every zoom**, not a fixed distance on the ground. A
  ground distance large enough to read when zoomed out would put the lines a block apart at street
  level; one small enough to look right at street level vanishes when zoomed out.
- The offset tapers back to the true centre line where the shared stretch opens out, so the line
  does not step sideways.
- Station markers and trains on a shared stretch move with their own line, rather than staying on
  the centre line while the track they belong to moves away from them.
- Coincident geometry is given a small separation in height, so two lines on one alignment can never
  z-fight again whatever a future feed does.

## Capabilities

### Modified Capabilities

- `network-map`: the requirement that each line is drawn along its recorded geometry needs
  qualifying — where two lines share an alignment, each is drawn beside it rather than on it. The
  requirement that stations are drawn on the track they serve needs the same qualification, because
  "the track" has moved.

## Impact

- **New code**: detecting shared corridors from the data, and computing a perpendicular offset as a
  function of distance along a line.
- **Modified**: the line and station layers, and the train positioning, all of which must apply the
  same offset or come apart from each other.
- **No change** to `src/sim/`. The simulation keeps reporting true positions along the true centre
  line; the offset is a drawing concern and belongs in `src/map`. This also keeps the golden tests
  meaningful, since they pin `alongMetres` against the unmodified feed.
- **Dependencies**: none added.
- **Performance**: the offset geometry depends on the camera, so it is rebuilt when the zoom
  changes — not per frame. Only the lines that actually share track need rebuilding.

## What the data says

Checked against `data/network.json` rather than assumed:

- **Exactly one pair of lines shares geometry.** Ampang and Sri Petaling, 89 identical vertices. No
  other pair shares any vertex.
- The shared stretch is **the last 8,488 m of both lines** — Ampang 6,405 m to 14,893 m, Sri
  Petaling 28,762 m to 37,250 m — and both terminate at the same place.
- Both traverse it in the same direction: the first and last shared vertices are identical for each.

So there is one corridor, with one open end and one terminal end. The corridor is nonetheless
**detected from the data rather than hardcoded**, because a refreshed feed could interline a
different pair and a hardcoded fix would quietly stop working.

## A convention, declared as one

Ampang and Sri Petaling are **interlined**: they run over the same physical rails, not over two
parallel alignments. Drawing them side by side is a map convention, and every transit map does it.

It is a drawing decision rather than an invented fact about the feed, so it does not breach the
honesty rule. It is written down so that nobody later reads two parallel lines as two separate
railways.

## Non-goals

- Merging interchange station markers into one marker per place. Still after-version-1, and a
  different problem: several lines meeting at a point, rather than two lines running together.
- A general railway-atlas layout engine. One corridor exists; the code should handle more if the
  feed grows them, but it is not a track-diagram solver.
