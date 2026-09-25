# Proposal

## Why

The feed gives every line its own stop id at a shared station: KL Sentral is `KJ15` and `MR1`, and
Titiwangsa is four stops. Nothing in the app knows they are one place. That is right for drawing,
and `network-map` requires it, but it blocks the two features that reason about the network as a
network. The journey planner (#26) cannot change lines at Masjid Jamek without knowing `KJ13` and
`AG7` are one place, and station labels (#25) would print "Titiwangsa" four times in one spot.

This implements issue #23. It adds knowledge, not pixels.

## What Changes

- A pure module in `src/sim/` derives **places** from the network, once: every stop belongs to
  exactly one place, and stops share a place when, and only when, their names are exactly equal.
  No station name is hardcoded.
- Each place carries a stable id, its name, its stop ids, the lines that serve it (taken from the
  timetable, not from `stops.route_id`), a representative position, and the straight-line distance
  between every pair of its stops.
- `npm run check:feed` gains two rules that protect the grouping on any future feed: stops sharing a
  name must lie close together, and differently-named stops must not lie on top of each other. Both
  are proven to fail, as every existing check is.
- Nothing is drawn differently. No layer, marker, card or label changes. Nothing in the app consumes
  places yet; #25 and #26 will.

## What the data says

Measured from `data/network.json`, not taken from the issue:

- 187 stop ids, 160 distinct names, 22 names used by more than one stop. Titiwangsa is 4 stops
  (`AG3`, `SP3`, `PY17`, `MR11`). These match the issue.
- The closest two differently-named stops are 230.1 m apart (Plaza Rakyat `AG8` and Merdeka `KG17`),
  so "none within 150 m" holds.
- **The issue's largest spread is wrong.** It gives Chan Sow Lin's 114 m as the widest group; that is
  only the widest of the three- and four-stop groups. The widest group of any size is **Ampang Park,
  293.6 m** (`KJ9` to `PY20`), then KL Sentral 246.2 m and Bandar Utama 220.0 m, all measured between
  published coordinates in the network's flat projection.
- So same-named stops can be further apart (293.6 m) than differently-named ones are close (230.1 m).
  Distance cannot tell an interchange from two neighbouring stations; only the name can. This is
  why the key is the name and proximity is only a check on it.
- Seven groups are 0 m apart: the Ampang and Sri Petaling stations on their shared track, which are
  one platform serving both services.

## Capabilities

### New Capabilities

- `places`: grouping per-line stops into named places, what each place knows (stops, lines,
  position, transfer distances), and the feed rules that keep the grouping trustworthy.

### Modified Capabilities

None. `network-map`'s requirement that stations sharing a name are each drawn on their own line is
unchanged and remains true: this change does not touch drawing.

## Impact

- **New code**: `src/sim/places.ts` and its test; a `Place` type in `src/sim/types.ts`; an export
  from `src/sim/index.ts`. Covered by the existing purity test.
- **Modified**: `scripts/check_feed.py` gains two checks and two self-test cases.
- **Not decided here**: transfer *time*. This change derives distance only; turning it into a walking
  time is the journey planner's job (#26).
- **Dependencies**: none added.
- **Visual**: none. There is nothing to look at in the browser, by design.
